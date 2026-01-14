#!/bin/bash
# Import orphaned AWS resources into Terraform state
# Run from terraform/ directory

set -e

PREFIX="colab-scheduler-dev"

echo "=== Importing orphaned DynamoDB tables ==="
tofu import aws_dynamodb_table.bookings "${PREFIX}-bookings"
tofu import aws_dynamodb_table.users "${PREFIX}-users"
tofu import aws_dynamodb_table.activity "${PREFIX}-activity"
tofu import aws_dynamodb_table.invites "${PREFIX}-invites"
tofu import aws_dynamodb_table.certifications "${PREFIX}-certifications"
tofu import aws_dynamodb_table.sessions "${PREFIX}-sessions"
tofu import 'aws_dynamodb_table.idempotency[0]' "${PREFIX}-idempotency"
tofu import 'aws_dynamodb_table.ratelimit[0]' "${PREFIX}-ratelimit"

echo "=== Importing orphaned IAM roles ==="
tofu import aws_iam_role.lambda "${PREFIX}-lambda-role"
tofu import 'aws_iam_role.worker[0]' "${PREFIX}-worker-role"

echo "=== All imports complete ==="
echo "Run 'tofu plan' to verify state"
