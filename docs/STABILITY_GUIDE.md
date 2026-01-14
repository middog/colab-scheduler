# Stability & Reliability Guide

**Version:** 4.2.0  
**Date:** January 2026

Production reliability enhancements for Lambda/serverless deployment.

---

## Overview

Version 4.2.0 adds production-grade reliability patterns:

| Feature | Implementation | Storage |
|---------|---------------|---------|
| Idempotency | DynamoDB-backed deduplication + middleware | `colab-scheduler-idempotency` table |
| Rate Limiting | API Gateway (primary) + DynamoDB (fallback) | `colab-scheduler-ratelimit` table |
| Async Queue | SQS for non-critical notifications | `colab-scheduler-integrations` queue |
| **SQS Worker** | Lambda processes queued messages | `colab-scheduler-worker` function |
| Circuit Breakers | Per-instance, per-integration | In-memory (Lambda) |
| Timeouts | 5s default, 10s for Google Calendar | N/A |
| Retries | Exponential backoff, 2-3 attempts | N/A |
| **Monitoring** | CloudWatch alarms for DLQ + errors | AWS CloudWatch |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Gateway                               │
│                    (Rate Limiting Primary)                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API Lambda Function                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Idempotency │  │ Rate Limit  │  │   Circuit Breakers      │ │
│  │ Middleware  │  │ (Fallback)  │  │ (per-integration)       │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│                                                                  │
│  POST /api/bookings  ──►  DynamoDB Idempotency Check            │
│  POST /api/bookings/:id/approve  ──►  Idempotency Check         │
│                                                                  │
│  Non-critical notifications  ──►  SQS Queue                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SQS Integration Queue                        │
│                 (Visibility: 30s, Retention: 1 day)             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Worker Lambda Function                        │
│                                                                  │
│  Processes: slack.newBooking, slack.approved, slack.rejected,   │
│             email.bookingApproved, email.bookingRejected        │
│                                                                  │
│  Failure: 3 retries → DLQ                                       │
└────────────────────────────┬────────────────────────────────────┘
                             │ (on failure)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Dead Letter Queue (DLQ)                          │
│              (Retention: 14 days, Alarmed)                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Required Infrastructure

### DynamoDB Tables

#### Idempotency Table

```bash
aws dynamodb create-table \
  --table-name colab-scheduler-idempotency \
  --attribute-definitions AttributeName=idempotencyKey,AttributeType=S \
  --key-schema AttributeName=idempotencyKey,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --tags Key=Project,Value=SDCoLab

# Enable TTL for automatic cleanup
aws dynamodb update-time-to-live \
  --table-name colab-scheduler-idempotency \
  --time-to-live-specification Enabled=true,AttributeName=ttl
```

#### Rate Limit Table (Fallback)

```bash
aws dynamodb create-table \
  --table-name colab-scheduler-ratelimit \
  --attribute-definitions AttributeName=rateLimitKey,AttributeType=S \
  --key-schema AttributeName=rateLimitKey,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --tags Key=Project,Value=SDCoLab

aws dynamodb update-time-to-live \
  --table-name colab-scheduler-ratelimit \
  --time-to-live-specification Enabled=true,AttributeName=ttl
```

### SQS Queue

```bash
# Standard queue for notifications
aws sqs create-queue \
  --queue-name colab-scheduler-integrations \
  --attributes '{
    "VisibilityTimeoutSeconds": "30",
    "MessageRetentionPeriod": "86400",
    "ReceiveMessageWaitTimeSeconds": "20"
  }' \
  --tags Project=SDCoLab

# Create dead letter queue
aws sqs create-queue \
  --queue-name colab-scheduler-integrations-dlq \
  --tags Project=SDCoLab

# Configure DLQ redrive policy
aws sqs set-queue-attributes \
  --queue-url <QUEUE_URL> \
  --attributes '{
    "RedrivePolicy": "{\"deadLetterTargetArn\":\"<DLQ_ARN>\",\"maxReceiveCount\":\"3\"}"
  }'
```

### Environment Variables

Add to Lambda configuration:

```bash
# DynamoDB tables (optional - defaults provided)
IDEMPOTENCY_TABLE=colab-scheduler-idempotency
RATE_LIMIT_TABLE=colab-scheduler-ratelimit

# SQS queue (required for async notifications)
INTEGRATION_QUEUE_URL=https://sqs.us-west-2.amazonaws.com/123456789/colab-scheduler-integrations
```

---

## API Gateway Rate Limiting

**Primary rate limiting should be at API Gateway level**, not in the Lambda.

### Usage Plan Configuration

```bash
# Create usage plan
aws apigateway create-usage-plan \
  --name "SDCoLab-Standard" \
  --throttle burstLimit=100,rateLimit=50 \
  --quota limit=10000,period=DAY

# Create stricter plan for auth endpoints
aws apigateway create-usage-plan \
  --name "SDCoLab-Auth" \
  --throttle burstLimit=20,rateLimit=10 \
  --quota limit=1000,period=DAY
```

### WAF Rate-Based Rules (Recommended)

```bash
aws wafv2 create-web-acl \
  --name sdcolab-rate-limit \
  --scope REGIONAL \
  --default-action Allow={} \
  --rules '[{
    "Name": "RateLimit",
    "Priority": 1,
    "Statement": {
      "RateBasedStatement": {
        "Limit": 1000,
        "AggregateKeyType": "IP"
      }
    },
    "Action": { "Block": {} },
    "VisibilityConfig": {
      "SampledRequestsEnabled": true,
      "CloudWatchMetricsEnabled": true,
      "MetricName": "RateLimitRule"
    }
  }]' \
  --visibility-config SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=sdcolab-waf
```

---

## Health Endpoints

| Endpoint | Purpose | Use For |
|----------|---------|---------|
| `GET /api/health` | Basic liveness | ALB health check |
| `GET /api/ready` | Integration status | Deployment verification |
| `GET /api/health/deep` | Full diagnostics | Debugging |

### Example Response: `/api/ready`

```json
{
  "status": "ready",
  "timestamp": "2026-01-10T12:00:00.000Z",
  "integrations": {
    "googleCalendar": {
      "enabled": true,
      "initialized": true,
      "circuit": { "state": "closed", "failures": 0 }
    }
  },
  "queue": {
    "type": "sqs",
    "queueUrl": "***configured***"
  },
  "degradedServices": 0
}
```

---

## Idempotency

Prevents duplicate operations from client retries, network issues, or webhook replays.

### Automatic Booking Idempotency

Bookings are automatically deduplicated using:
- User email
- Tool ID  
- Date
- Start/end time

Key format: `booking:{email}:{tool}:{date}:{startTime}:{endTime}`

### Manual Idempotency (via Header)

Clients can provide `X-Idempotency-Key` header for explicit deduplication:

```bash
curl -X POST /api/bookings \
  -H "X-Idempotency-Key: client-request-123" \
  -d '{"tool": "laser", "date": "2026-01-15", ...}'
```

---

## Circuit Breakers

Each integration has an independent circuit breaker:

| Integration | Threshold | Reset Time |
|-------------|-----------|------------|
| Google Calendar | 3 failures | 60 seconds |
| GitHub | 5 failures | 30 seconds |
| Slack | 5 failures | 30 seconds |
| Email (SES) | 3 failures | 60 seconds |

**Note:** Circuit breakers are per-Lambda-instance. For distributed circuit breaking, monitor CloudWatch metrics and use API Gateway throttling.

### States

- **CLOSED**: Normal operation
- **OPEN**: Failing fast, returning errors immediately
- **HALF-OPEN**: Testing recovery with probe requests

---

## SQS Worker

For processing queued notifications, deploy a worker Lambda:

```javascript
// worker/handler.js
import { slackService } from './integrations/slack.js';
import { sendEmail } from './integrations/email.js';

export const handler = async (event) => {
  for (const record of event.Records) {
    const { taskType, payload } = JSON.parse(record.body);
    
    switch (taskType) {
      case 'slack.newBooking':
        await slackService.notifyNewBooking(payload.booking);
        break;
      case 'email.bookingApproved':
        await sendEmail(payload.to, 'bookingApproved', payload);
        break;
      // ... other task types
    }
  }
};
```

---

## Terraform Updates

Add to your Terraform configuration:

```hcl
# DynamoDB - Idempotency
resource "aws_dynamodb_table" "idempotency" {
  name         = "colab-scheduler-idempotency"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "idempotencyKey"

  attribute {
    name = "idempotencyKey"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = { Project = "SDCoLab" }
}

# DynamoDB - Rate Limit
resource "aws_dynamodb_table" "ratelimit" {
  name         = "colab-scheduler-ratelimit"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "rateLimitKey"

  attribute {
    name = "rateLimitKey"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = { Project = "SDCoLab" }
}

# SQS Queue
resource "aws_sqs_queue" "integrations" {
  name                       = "colab-scheduler-integrations"
  visibility_timeout_seconds = 30
  message_retention_seconds  = 86400
  receive_wait_time_seconds  = 20

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.integrations_dlq.arn
    maxReceiveCount     = 3
  })

  tags = { Project = "SDCoLab" }
}

resource "aws_sqs_queue" "integrations_dlq" {
  name = "colab-scheduler-integrations-dlq"
  tags = { Project = "SDCoLab" }
}

# Lambda environment variables
resource "aws_lambda_function" "api" {
  # ... existing config ...
  
  environment {
    variables = {
      # ... existing vars ...
      IDEMPOTENCY_TABLE     = aws_dynamodb_table.idempotency.name
      RATE_LIMIT_TABLE      = aws_dynamodb_table.ratelimit.name
      INTEGRATION_QUEUE_URL = aws_sqs_queue.integrations.url
    }
  }
}
```

---

## Failure Scenarios

### Google Calendar Down

1. Circuit breaker opens after 3 consecutive failures
2. Booking approval succeeds (calendar event skipped)
3. `/api/ready` shows `status: "degraded"`
4. Circuit tests recovery every 60 seconds
5. Admin can manually retry calendar creation later

### SQS Unavailable

1. Notifications fall back to fire-and-forget
2. Warning logged: "SQS not configured"
3. Non-critical - bookings still succeed
4. Configure DLQ monitoring for failures

### High Traffic Spike

1. API Gateway throttling kicks in first
2. DynamoDB rate limit fallback for bypassed requests
3. Circuit breakers prevent cascading to integrations
4. SQS absorbs notification backlog

---

## Monitoring Recommendations

### CloudWatch Alarms

```bash
# Circuit breaker opens
aws cloudwatch put-metric-alarm \
  --alarm-name "SDCoLab-CircuitOpen" \
  --metric-name "CircuitBreakerOpen" \
  --namespace "SDCoLab/Scheduler" \
  --statistic Sum \
  --period 60 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold

# SQS DLQ messages
aws cloudwatch put-metric-alarm \
  --alarm-name "SDCoLab-DLQ-Messages" \
  --metric-name "ApproximateNumberOfMessagesVisible" \
  --namespace "AWS/SQS" \
  --dimensions Name=QueueName,Value=colab-scheduler-integrations-dlq \
  --statistic Sum \
  --period 300 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold
```

### Key Metrics

- `IntegrationTimeout` - Count of timeouts per integration
- `CircuitBreakerState` - Current state (0=closed, 1=open, 2=half-open)
- `IdempotentReplays` - Duplicate requests caught
- `RateLimitHits` - Requests rate-limited

---

## Migration from 4.1.0

1. Create DynamoDB tables (idempotency + ratelimit)
2. Create SQS queue
3. Update Lambda environment variables
4. Deploy new code
5. Configure API Gateway throttling
6. Verify with `/api/health/deep`

No data migration needed - new tables start empty.

---

*🔥 SDCoLab Scheduler v4.2.0 - Production Ready*
