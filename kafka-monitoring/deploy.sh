#!/bin/bash

# Unified Kafka Share Group Monitoring Deployment Script
# This script handles all deployment tasks including environment setup, config generation, and deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Display usage
usage() {
    echo "Usage: $0 [OPTIONS] [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  generate    Generate Kubernetes configs from templates"
    echo "  deploy      Deploy to Kubernetes (default)"
    echo "  deploy-enhanced Deploy enhanced OHI with all 4 collection modes"
    echo "  status      Check deployment status"
    echo "  clean       Clean up all resources"
    echo "  test        Run test workload"
    echo ""
    echo "Options:"
    echo "  -h, --help     Show this help message"
    echo "  -e, --env      Specify .env file (default: .env)"
    echo "  -n, --dry-run  Show what would be deployed without applying"
    echo ""
}

# Default values
ENV_FILE=".env"
DRY_RUN=false
COMMAND="deploy"
DEPLOY_ENHANCED=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            usage
            exit 0
            ;;
        -e|--env)
            ENV_FILE="$2"
            shift 2
            ;;
        -n|--dry-run)
            DRY_RUN=true
            shift
            ;;
        generate|deploy|status|clean|test)
            COMMAND="$1"
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            exit 1
            ;;
    esac
done

# Load environment from parent directory .env if exists
if [ -f "../$ENV_FILE" ]; then
    echo -e "${BLUE}📋 Loading environment from ../$ENV_FILE${NC}"
    set -a
    source "../$ENV_FILE"
    set +a
elif [ -f "$ENV_FILE" ]; then
    echo -e "${BLUE}📋 Loading environment from $ENV_FILE${NC}"
    set -a
    source "$ENV_FILE"
    set +a
else
    echo -e "${RED}❌ Environment file not found: $ENV_FILE${NC}"
    echo -e "${YELLOW}Creating default .env file...${NC}"
    
    cat > .env << 'EOF'
# Kafka Configuration
KAFKA_BROKER_HOST=localhost
KAFKA_BROKER_PORT=9092
KAFKA_ZOOKEEPER_HOST=localhost
KAFKA_ZOOKEEPER_PORT=2181
KAFKA_VERSION=7.5.0
KAFKA_NAMESPACE=kafka-monitoring
KAFKA_CLUSTER_NAME=kafka-k8s-cluster

# New Relic Configuration
NEW_RELIC_LICENSE_KEY=your_license_key_here
NEW_RELIC_APP_NAME=kafka-monitoring
NEW_RELIC_CLUSTER_NAME=k8s-kafka-monitoring

# Environment
ENVIRONMENT=development

# Custom OHI Configuration
OHI_ENTITY_NAME=kafka-sharegroup-ohi
OHI_INTEGRATION_VERSION=1.0.0
OHI_PROTOCOL_VERSION=3

# Prometheus Configuration
PROMETHEUS_ENDPOINT=http://kafka-0.kafka:9404/metrics

# Kafka Share Groups Configuration
SHARE_GROUP_MONITORING_INTERVAL=30
SHARE_GROUP_TOPIC=share-group-topic
EOF
    
    echo -e "${GREEN}✅ Created default .env file. Please edit it with your configuration.${NC}"
    exit 1
fi

# Function to generate configs
generate_configs() {
    echo -e "${GREEN}🔧 Generating configuration files...${NC}"
    
    # Create directories
    mkdir -p generated
    
    # Generate static files first
    echo -e "${BLUE}📄 Generating static configurations...${NC}"
    
    # 00-namespace.yaml
    cat > generated/00-namespace.yaml << EOF
apiVersion: v1
kind: Namespace
metadata:
  name: ${KAFKA_NAMESPACE}
EOF
    
    # 00-env-configmap.yaml
    cat > generated/00-env-configmap.yaml << EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: kafka-env-config
  namespace: ${KAFKA_NAMESPACE}
data:
  KAFKA_BROKER_HOST: "${KAFKA_BROKER_HOST}"
  KAFKA_BROKER_PORT: "${KAFKA_BROKER_PORT}"
  KAFKA_ZOOKEEPER_HOST: "${KAFKA_ZOOKEEPER_HOST}"
  KAFKA_ZOOKEEPER_PORT: "${KAFKA_ZOOKEEPER_PORT}"
  NEW_RELIC_APP_NAME: "${NEW_RELIC_APP_NAME}"
  ENVIRONMENT: "${ENVIRONMENT}"
  OHI_ENTITY_NAME: "${OHI_ENTITY_NAME}"
  OHI_INTEGRATION_VERSION: "${OHI_INTEGRATION_VERSION}"
  OHI_PROTOCOL_VERSION: "${OHI_PROTOCOL_VERSION}"
  PROMETHEUS_ENDPOINT: "${PROMETHEUS_ENDPOINT}"
  SHARE_GROUP_MONITORING_INTERVAL: "${SHARE_GROUP_MONITORING_INTERVAL}"
  SHARE_GROUP_TOPIC: "${SHARE_GROUP_TOPIC}"
EOF
    
    # 00-env-secret.yaml
    cat > generated/00-env-secret.yaml << EOF
apiVersion: v1
kind: Secret
metadata:
  name: kafka-env-secret
  namespace: ${KAFKA_NAMESPACE}
type: Opaque
stringData:
  NEW_RELIC_LICENSE_KEY: "${NEW_RELIC_LICENSE_KEY}"
EOF
    
    # Copy non-template files directly
    echo -e "${BLUE}📄 Copying deployment files...${NC}"
    
    # Add enhanced OHI specific environment variables for template processing
    export COLLECT_CONSUMER_GROUPS="${COLLECT_CONSUMER_GROUPS:-true}"
    export COLLECT_SHARE_GROUPS="${COLLECT_SHARE_GROUPS:-true}"
    export COLLECT_PRODUCERS="${COLLECT_PRODUCERS:-true}"
    export COLLECT_BROKER_HEALTH="${COLLECT_BROKER_HEALTH:-true}"
    export CLUSTER_NAME="${CLUSTER_NAME:-kafka-k8s-cluster}"
    export SERVICE_NAME="${SERVICE_NAME:-kafka-monitoring}"
    export CLOUD_PROVIDER="${CLOUD_PROVIDER:-self-hosted}"
    export REGION="${REGION:-us-east-1}"
    export OHI_VERBOSE="${OHI_VERBOSE:-1}"
    
    # If files exist in current directory, use them; otherwise check templates
    for file in 01-kafka-zookeeper.yaml 02-kafka-broker.yaml 03-newrelic-configmap.yaml \
                04-flex-configmap.yaml 05-newrelic-daemonset.yaml 06-test-sharegroup-consumer.yaml \
                07-custom-ohi-configmap.yaml 08-custom-ohi-deployment.yaml \
                09-monitoring-dashboard.yaml 10-test-workload-generator.yaml \
                11-troubleshooting-tools.yaml 12-kafka-enhanced-ohi-configmap.yaml \
                13-kafka-enhanced-ohi-deployment.yaml; do
        
        if [ -f "$file" ]; then
            # Use envsubst to replace variables
            envsubst < "$file" > "generated/$file"
            echo -e "${GREEN}✅ Generated: generated/$file${NC}"
        elif [ -f "templates/${file}.tmpl" ]; then
            # Process template file
            envsubst < "templates/${file}.tmpl" > "generated/$file"
            echo -e "${GREEN}✅ Generated: generated/$file (from template)${NC}"
        fi
    done
    
    echo -e "${GREEN}✅ Configuration generation complete!${NC}"
}

# Function to deploy to Kubernetes
deploy_to_k8s() {
    echo -e "${GREEN}🚀 Starting Kafka monitoring deployment...${NC}"
    
    # Check if kubectl is available
    if ! command -v kubectl &> /dev/null; then
        echo -e "${RED}❌ kubectl is not installed. Please install it first.${NC}"
        exit 1
    fi
    
    # Generate configs if needed
    if [ ! -d "generated" ] || [ -z "$(ls -A generated 2>/dev/null)" ]; then
        generate_configs
    fi
    
    # Deploy in order
    local KUBECTL_CMD="kubectl apply"
    if [ "$DRY_RUN" = true ]; then
        KUBECTL_CMD="kubectl apply --dry-run=client"
        echo -e "${YELLOW}🔍 Running in dry-run mode...${NC}"
    fi
    
    echo -e "${BLUE}📦 Creating namespace and configs...${NC}"
    $KUBECTL_CMD -f generated/00-namespace.yaml
    $KUBECTL_CMD -f generated/00-env-configmap.yaml
    $KUBECTL_CMD -f generated/00-env-secret.yaml
    
    echo -e "${BLUE}📦 Deploying Kafka infrastructure...${NC}"
    [ -f generated/01-kafka-zookeeper.yaml ] && $KUBECTL_CMD -f generated/01-kafka-zookeeper.yaml
    [ -f generated/02-kafka-broker.yaml ] && $KUBECTL_CMD -f generated/02-kafka-broker.yaml
    
    if [ "$DRY_RUN" = false ]; then
        echo -e "${YELLOW}⏳ Waiting for Kafka to be ready...${NC}"
        kubectl wait --for=condition=ready pod/kafka-0 -n ${KAFKA_NAMESPACE} --timeout=300s || {
            echo -e "${RED}❌ Kafka failed to start. Check logs with: kubectl logs kafka-0 -n ${KAFKA_NAMESPACE}${NC}"
            exit 1
        }
    fi
    
    echo -e "${BLUE}📦 Deploying New Relic monitoring...${NC}"
    [ -f generated/03-newrelic-configmap.yaml ] && $KUBECTL_CMD -f generated/03-newrelic-configmap.yaml
    [ -f generated/04-flex-configmap.yaml ] && $KUBECTL_CMD -f generated/04-flex-configmap.yaml
    [ -f generated/05-newrelic-daemonset.yaml ] && $KUBECTL_CMD -f generated/05-newrelic-daemonset.yaml
    
    echo -e "${BLUE}📦 Deploying test components...${NC}"
    [ -f generated/06-test-sharegroup-consumer.yaml ] && $KUBECTL_CMD -f generated/06-test-sharegroup-consumer.yaml
    
    echo -e "${BLUE}📦 Deploying Custom OHI for Share Groups...${NC}"
    [ -f generated/07-custom-ohi-configmap.yaml ] && $KUBECTL_CMD -f generated/07-custom-ohi-configmap.yaml
    [ -f generated/08-custom-ohi-deployment.yaml ] && $KUBECTL_CMD -f generated/08-custom-ohi-deployment.yaml
    
    echo -e "${BLUE}📦 Deploying monitoring dashboards...${NC}"
    [ -f generated/09-monitoring-dashboard.yaml ] && $KUBECTL_CMD -f generated/09-monitoring-dashboard.yaml
    
    echo -e "${BLUE}📦 Deploying troubleshooting tools...${NC}"
    [ -f generated/11-troubleshooting-tools.yaml ] && $KUBECTL_CMD -f generated/11-troubleshooting-tools.yaml
    
    # Deploy Enhanced OHI if requested
    if [[ "$DEPLOY_ENHANCED" == "true" ]]; then
        echo ""
        echo -e "${YELLOW}🚀 Deploying Enhanced OHI with all 4 collection modes...${NC}"
        [ -f generated/12-kafka-enhanced-ohi-configmap.yaml ] && $KUBECTL_CMD -f generated/12-kafka-enhanced-ohi-configmap.yaml
        [ -f generated/13-kafka-enhanced-ohi-deployment.yaml ] && $KUBECTL_CMD -f generated/13-kafka-enhanced-ohi-deployment.yaml
        echo -e "${GREEN}✅ Enhanced OHI deployed${NC}"
    fi
    
    if [ "$DRY_RUN" = false ]; then
        echo ""
        echo -e "${GREEN}✅ Deployment complete!${NC}"
        show_status
    fi
}

# Function to show status
show_status() {
    echo ""
    echo -e "${BLUE}📊 Deployment Status:${NC}"
    echo "=================================="
    kubectl get pods -n ${KAFKA_NAMESPACE} --no-headers | while read line; do
        name=$(echo $line | awk '{print $1}')
        ready=$(echo $line | awk '{print $2}')
        status=$(echo $line | awk '{print $3}')
        
        if [[ "$status" == "Running" ]]; then
            echo -e "${GREEN}✅ $name ($ready) - $status${NC}"
        elif [[ "$status" == "Pending" ]]; then
            echo -e "${YELLOW}⏳ $name ($ready) - $status${NC}"
        else
            echo -e "${RED}❌ $name ($ready) - $status${NC}"
        fi
    done
    
    echo ""
    echo -e "${BLUE}📝 Useful commands:${NC}"
    echo "  # Check logs:"
    echo "  kubectl logs -f deployment/kafka-sharegroup-ohi -n ${KAFKA_NAMESPACE}"
    echo ""
    echo "  # Port forward to Prometheus metrics:"
    echo "  kubectl port-forward -n ${KAFKA_NAMESPACE} kafka-0 9404:9404"
    echo ""
    echo "  # Produce test messages:"
    echo "  kubectl exec -it kafka-0 -n ${KAFKA_NAMESPACE} -- kafka-console-producer --bootstrap-server localhost:9092 --topic ${SHARE_GROUP_TOPIC}"
    echo ""
    echo "  # Check New Relic for QueueSample events:"
    echo "  FROM QueueSample SELECT * WHERE provider = 'kafka' SINCE 10 minutes ago"
}

# Function to run test workload
run_test() {
    echo -e "${BLUE}🧪 Running test workload...${NC}"
    
    # Deploy test workload generator if not already deployed
    if [ -f generated/10-test-workload-generator.yaml ]; then
        kubectl apply -f generated/10-test-workload-generator.yaml
        echo -e "${GREEN}✅ Test workload generator deployed${NC}"
        echo ""
        echo "Monitor the job with:"
        echo "  kubectl logs -f job/workload-generator -n ${KAFKA_NAMESPACE}"
    else
        echo -e "${RED}❌ Test workload generator configuration not found${NC}"
        echo "Run './deploy.sh generate' first"
    fi
}

# Function to clean up
cleanup() {
    echo -e "${YELLOW}🗑️  Cleaning up Kafka monitoring deployment...${NC}"
    
    read -p "Are you sure you want to delete all resources in namespace ${KAFKA_NAMESPACE}? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        kubectl delete namespace ${KAFKA_NAMESPACE} --ignore-not-found=true
        echo -e "${GREEN}✅ Cleanup complete${NC}"
    else
        echo -e "${YELLOW}Cleanup cancelled${NC}"
    fi
}

# Main execution
case "$COMMAND" in
    generate)
        generate_configs
        ;;
    deploy)
        deploy_to_k8s
        ;;
    deploy-enhanced)
        DEPLOY_ENHANCED=true
        deploy_to_k8s
        ;;
    status)
        show_status
        ;;
    test)
        run_test
        ;;
    clean)
        cleanup
        ;;
    *)
        echo -e "${RED}Unknown command: $COMMAND${NC}"
        usage
        exit 1
        ;;
esac