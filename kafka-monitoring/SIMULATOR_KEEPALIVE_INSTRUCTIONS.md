# Kafka Simulator Keep-Alive Instructions

## Current Status
The Kafka comprehensive simulator is configured to run continuously with the following features:

### 1. Automatic Restart Policy
The deployment has `restartPolicy: Always` which means:
- If the pod crashes, Kubernetes will automatically restart it
- If the container exits, it will be restarted
- The simulator will keep running unless explicitly stopped

### 2. Current Configuration
```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "250m"
  limits:
    memory: "1Gi"
    cpu: "500m"
```

### 3. Simulator Features
The simulator continuously:
- Creates and maintains 23 different topic types
- Produces messages using 5 different patterns (steady, burst, large, keyed, transactional)
- Runs multiple consumer groups with different consumption patterns
- Generates comprehensive Kafka metrics

## To Ensure Simulator Keeps Running

### When Docker/Kubernetes is Running:

1. **Check simulator status**:
   ```bash
   kubectl get pods -n kafka-monitoring | grep simulator
   ```

2. **Monitor simulator logs**:
   ```bash
   kubectl logs -f deployment/kafka-comprehensive-simulator -n kafka-monitoring
   ```

3. **If simulator stops, restart it**:
   ```bash
   kubectl rollout restart deployment/kafka-comprehensive-simulator -n kafka-monitoring
   ```

4. **Scale up if needed**:
   ```bash
   kubectl scale deployment/kafka-comprehensive-simulator -n kafka-monitoring --replicas=1
   ```

### Health Monitoring Script
Use the monitor script created at:
```bash
/Users/deepaksharma/Desktop/src/kafka_setup/kafka-monitoring/monitor-simulator.sh
```

Run it in a separate terminal:
```bash
./monitor-simulator.sh
```

This script will:
- Check simulator health every 60 seconds
- Automatically restart if the pod fails
- Display current metrics (topics, consumer groups)

### Manual Health Check Commands

1. **Verify simulator process**:
   ```bash
   kubectl exec deployment/kafka-comprehensive-simulator -n kafka-monitoring -- \
     ps aux | grep python3
   ```

2. **Check message production**:
   ```bash
   kubectl exec kafka-0 -n kafka-monitoring -- bash -c \
     "export KAFKA_OPTS='' && kafka-run-class kafka.tools.GetOffsetShell \
     --broker-list localhost:9092 --topic standard-p5-topic | \
     awk -F: '{sum += \$3} END {print sum}'"
   ```

3. **Monitor active topics**:
   ```bash
   watch -n10 'kubectl exec kafka-0 -n kafka-monitoring -- bash -c \
     "export KAFKA_OPTS='"'"''"'"' && echo Topics: $(kafka-topics --list \
     --bootstrap-server localhost:9092 | wc -l)"'
   ```

## Troubleshooting

### If Simulator Stops:

1. **Check pod status**:
   ```bash
   kubectl describe pod -l app=kafka-comprehensive-simulator -n kafka-monitoring
   ```

2. **Check for OOM kills**:
   ```bash
   kubectl describe pod -l app=kafka-comprehensive-simulator -n kafka-monitoring | grep -i "OOMKilled"
   ```

3. **Force restart**:
   ```bash
   kubectl delete pod -l app=kafka-comprehensive-simulator -n kafka-monitoring
   ```

### Configuration Files
All simulator configurations are stored in:
- **Deployment**: `kafka-comprehensive-simulator-optimized.yaml`
- **ConfigMap**: Contains the Python simulator script
- **Monitor Script**: `monitor-simulator.sh`

## Important Notes

1. The simulator is designed to run indefinitely
2. It uses minimal resources (256MB heap)
3. Kubernetes will auto-restart on failure
4. The Python script has graceful shutdown handling
5. Messages are produced to random topics to ensure even distribution

## Quick Status Check
When Docker/Kubernetes is running, use this one-liner:
```bash
kubectl exec deployment/kafka-comprehensive-simulator -n kafka-monitoring -- \
  bash -c "echo '✅ Simulator Running' && ps aux | grep -q '[p]ython3' && \
  echo '📊 Process Active' || echo '❌ Process Not Found'"
```

The simulator will continue running as long as:
- The Kubernetes cluster is active
- The deployment exists
- No manual intervention stops it

To stop the simulator:
```bash
kubectl scale deployment/kafka-comprehensive-simulator -n kafka-monitoring --replicas=0
```

To start it again:
```bash
kubectl scale deployment/kafka-comprehensive-simulator -n kafka-monitoring --replicas=1
```