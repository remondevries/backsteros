#!/usr/bin/env bash
cd "$(dirname "$0")/../.."
export SKIP_BUILD=1
./deploy/cloud/deploy-cloud-core.sh 2>&1 | tee /tmp/backsteros-cloud-deploy.log
echo "=== DEPLOY_FINISHED exit:${PIPESTATUS[0]} ===" | tee -a /tmp/backsteros-cloud-deploy.log
read -n 1 -s -r -p "Press any key to close…"
