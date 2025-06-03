#!/bin/bash
# Test script for enhanced Kafka OHI implementation

set -e

NAMESPACE="${KAFKA_NAMESPACE:-kafka-monitoring}"

echo "=== Testing Enhanced Kafka OHI Implementation ==="
echo

# Function to check if pod is ready
wait_for_pod() {
    local pod_label=$1
    local timeout=${2:-60}
    
    echo "Waiting for pod with label $pod_label to be ready..."
    kubectl wait --for=condition=ready pod -l $pod_label -n $NAMESPACE --timeout=${timeout}s
}

# Function to run OHI locally for testing
test_ohi_locally() {
    echo "1. Testing OHI script locally..."
    
    # Create a test environment
    cat > /tmp/test-ohi-env.sh << 'EOF'
export PROMETHEUS_ENDPOINT="http://localhost:9404/metrics"
export COLLECT_CONSUMER_GROUPS="true"
export COLLECT_SHARE_GROUPS="true"
export COLLECT_PRODUCERS="true"
export COLLECT_BROKER_HEALTH="true"
export CLUSTER_NAME="kafka-test-cluster"
export ENVIRONMENT="test"
export REGION="us-east-1"
export SERVICE_NAME="kafka-test"
EOF

    # Port forward to Kafka metrics
    echo "Setting up port forwarding to Kafka metrics..."
    kubectl port-forward -n $NAMESPACE kafka-0 9404:9404 &
    PF_PID=$!
    sleep 5
    
    # Test the OHI script
    echo "Running OHI script..."
    source /tmp/test-ohi-env.sh
    python3 kafka-enhanced-ohi.py | jq '.' || echo "Failed to run OHI script"
    
    # Clean up
    kill $PF_PID 2>/dev/null || true
}

# Function to deploy enhanced OHI
deploy_enhanced_ohi() {
    echo "2. Deploying enhanced OHI to Kubernetes..."
    
    # Apply configurations
    kubectl apply -f kafka-enhanced-ohi-configmap.yaml
    kubectl apply -f kafka-enhanced-ohi-deployment.yaml
    
    # Wait for deployment
    wait_for_pod "app=kafka-enhanced-ohi" 120
    
    echo "Enhanced OHI deployed successfully"
}

# Function to check OHI logs
check_ohi_logs() {
    echo "3. Checking OHI logs..."
    
    # Get pod name
    POD_NAME=$(kubectl get pods -n $NAMESPACE -l app=kafka-enhanced-ohi -o jsonpath='{.items[0].metadata.name}')
    
    if [ -z "$POD_NAME" ]; then
        echo "Error: No enhanced OHI pod found"
        return 1
    fi
    
    echo "Tailing logs from pod $POD_NAME..."
    kubectl logs -n $NAMESPACE $POD_NAME --tail=50 | grep -E "(QueueSample|Integration|Error)" || true
}

# Function to validate metrics collection
validate_metrics() {
    echo "4. Validating metrics collection..."
    
    # Check if OHI is collecting metrics
    POD_NAME=$(kubectl get pods -n $NAMESPACE -l app=kafka-enhanced-ohi -o jsonpath='{.items[0].metadata.name}')
    
    echo "Executing OHI script inside pod..."
    kubectl exec -n $NAMESPACE $POD_NAME -- bash -c "cd /scripts && ./run-enhanced-ohi.sh" | jq '.data[0].inventory.metrics_collected' || echo "Failed to get metrics count"
}

# Function to generate test data
generate_test_data() {
    echo "5. Generating test data for all collection modes..."
    
    # Create topics if they don't exist
    echo "Creating test topics..."
    kubectl exec -n $NAMESPACE kafka-0 -- kafka-topics --bootstrap-server localhost:9092 --create --if-not-exists --topic test-consumer-group --partitions 3 --replication-factor 1
    kubectl exec -n $NAMESPACE kafka-0 -- kafka-topics --bootstrap-server localhost:9092 --create --if-not-exists --topic test-share-group --partitions 3 --replication-factor 1
    kubectl exec -n $NAMESPACE kafka-0 -- kafka-topics --bootstrap-server localhost:9092 --create --if-not-exists --topic test-producer --partitions 3 --replication-factor 1
    
    # Produce messages
    echo "Producing test messages..."
    kubectl exec -n $NAMESPACE kafka-0 -- bash -c "echo 'test message 1' | kafka-console-producer --bootstrap-server localhost:9092 --topic test-consumer-group"
    kubectl exec -n $NAMESPACE kafka-0 -- bash -c "echo 'test message 2' | kafka-console-producer --bootstrap-server localhost:9092 --topic test-share-group"
    kubectl exec -n $NAMESPACE kafka-0 -- bash -c "echo 'test message 3' | kafka-console-producer --bootstrap-server localhost:9092 --topic test-producer"
    
    # Create consumer group
    echo "Creating test consumer group..."
    kubectl exec -n $NAMESPACE kafka-0 -- kafka-console-consumer --bootstrap-server localhost:9092 --topic test-consumer-group --group test-consumer-group --from-beginning --max-messages 1
}

# Function to verify NRQL queries
verify_nrql() {
    echo "6. NRQL queries to verify enhanced QueueSample events..."
    
    cat << 'EOF'
Run these queries in New Relic Query Builder:

-- All QueueSample events from enhanced OHI
SELECT * FROM QueueSample 
WHERE provider = 'kafka' 
AND cluster.name = 'kafka-k8s-cluster'
SINCE 10 minutes ago

-- Consumer Group metrics
SELECT average(queue.size), average(consumer.lag.max), average(messages.consumed.rate)
FROM QueueSample 
WHERE provider = 'kafka' 
AND consumer.group.name IS NOT NULL
FACET consumer.group.name, topic.name
SINCE 10 minutes ago

-- Share Group metrics
SELECT average(queue.size), average(oldest.message.age.seconds), average(messages.acknowledged)
FROM QueueSample 
WHERE provider = 'kafka' 
AND share.group.name IS NOT NULL
FACET share.group.name, topic.name
SINCE 10 minutes ago

-- Producer metrics
SELECT average(messages.in.rate), average(producer.count), average(error.rate)
FROM QueueSample 
WHERE provider = 'kafka' 
AND producer.count > 0
FACET topic.name
SINCE 10 minutes ago

-- Broker/Topic health
SELECT average(queue.throughput.bytes), average(partition.count), latest(health.status)
FROM QueueSample 
WHERE provider = 'kafka' 
AND broker.count > 0
FACET topic.name
SINCE 10 minutes ago
EOF
}

# Main execution
main() {
    echo "Starting enhanced OHI testing..."
    echo "Namespace: $NAMESPACE"
    echo
    
    # Check if running locally or in cluster
    if [ "$1" == "local" ]; then
        test_ohi_locally
    elif [ "$1" == "deploy" ]; then
        deploy_enhanced_ohi
        sleep 10
        check_ohi_logs
        validate_metrics
    elif [ "$1" == "test-data" ]; then
        generate_test_data
    elif [ "$1" == "verify" ]; then
        check_ohi_logs
        validate_metrics
        verify_nrql
    else
        echo "Usage: $0 [local|deploy|test-data|verify]"
        echo "  local     - Test OHI script locally with port forwarding"
        echo "  deploy    - Deploy enhanced OHI to Kubernetes"
        echo "  test-data - Generate test data for all collection modes"
        echo "  verify    - Check logs, validate metrics, and show NRQL queries"
        exit 1
    fi
}

main "$@"