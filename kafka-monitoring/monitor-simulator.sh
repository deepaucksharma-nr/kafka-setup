#!/bin/bash

# Kafka Simulator Health Monitor
# This script monitors the simulator and restarts it if needed

NAMESPACE="kafka-monitoring"
DEPLOYMENT="kafka-comprehensive-simulator"
CHECK_INTERVAL=60  # Check every 60 seconds

echo "🔍 Starting Kafka Simulator Monitor..."
echo "Monitoring deployment: $DEPLOYMENT in namespace: $NAMESPACE"
echo "Check interval: ${CHECK_INTERVAL}s"
echo "----------------------------------------"

while true; do
    # Get current timestamp
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Check if deployment exists and is running
    READY_REPLICAS=$(kubectl get deployment $DEPLOYMENT -n $NAMESPACE -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
    DESIRED_REPLICAS=$(kubectl get deployment $DEPLOYMENT -n $NAMESPACE -o jsonpath='{.spec.replicas}' 2>/dev/null)
    
    if [ -z "$DESIRED_REPLICAS" ]; then
        echo "[$TIMESTAMP] ❌ Deployment not found!"
        exit 1
    fi
    
    if [ "$READY_REPLICAS" != "$DESIRED_REPLICAS" ]; then
        echo "[$TIMESTAMP] ⚠️  Simulator not ready ($READY_REPLICAS/$DESIRED_REPLICAS replicas)"
        echo "[$TIMESTAMP] 🔄 Restarting simulator pod..."
        kubectl rollout restart deployment/$DEPLOYMENT -n $NAMESPACE
        sleep 30  # Wait for restart
    else
        # Check if simulator is actually producing messages
        POD_NAME=$(kubectl get pods -n $NAMESPACE -l app=$DEPLOYMENT -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
        
        if [ -n "$POD_NAME" ]; then
            # Check if Python process is running
            PYTHON_PROCS=$(kubectl exec $POD_NAME -n $NAMESPACE -- ps aux 2>/dev/null | grep -c "python3 /scripts/simulator.py" | grep -v grep)
            
            if [ "$PYTHON_PROCS" -eq "0" ]; then
                echo "[$TIMESTAMP] ⚠️  Python process not running in pod $POD_NAME"
                echo "[$TIMESTAMP] 🔄 Restarting simulator pod..."
                kubectl delete pod $POD_NAME -n $NAMESPACE
                sleep 30
            else
                # Get some stats
                TOPICS=$(kubectl exec kafka-0 -n $NAMESPACE -- bash -c "export KAFKA_OPTS='' && kafka-topics --list --bootstrap-server localhost:9092 2>/dev/null | wc -l" 2>/dev/null)
                GROUPS=$(kubectl exec kafka-0 -n $NAMESPACE -- bash -c "export KAFKA_OPTS='' && kafka-consumer-groups --list --bootstrap-server localhost:9092 2>/dev/null | wc -l" 2>/dev/null)
                
                echo "[$TIMESTAMP] ✅ Simulator healthy | Pod: $POD_NAME | Topics: $TOPICS | Consumer Groups: $GROUPS"
            fi
        fi
    fi
    
    sleep $CHECK_INTERVAL
done