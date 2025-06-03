# Enhanced Kafka OHI Implementation Guide

## Overview

This enhanced Kafka OHI (On-Host Integration) implementation provides comprehensive support for New Relic's Queues & Streams feature with all 4 collection modes, addressing the gaps identified in the original implementation.

## Key Enhancements

### 1. Comprehensive QueueSample Attributes
The enhanced OHI now includes all required attributes for full Queues & Streams UI support:

- **Producer metrics**: `producer.count`, `messages.in.rate`, `messages.published`, `producer.errors`
- **Consumer metrics**: `consumer.lag.max`, `consumer.utilization`, `messages.consumed.rate`, `consumer.count`
- **Queue health**: `queue.waitTime.avg`, `queue.processingTime.avg`, `error.rate`, `health.status`
- **Entity metadata**: `service.name`, `environment`, `region`, `cloud.provider`, `cluster.name`
- **Throughput metrics**: `queue.throughput.bytes`, `bytes.in.rate`, `bytes.out.rate`

### 2. All 4 Collection Modes

#### Mode 1: Traditional Consumer Groups
- Tracks offset-based consumer lag
- Monitors consumer group state and membership
- Provides per-partition and topic-level aggregations

#### Mode 2: Share Groups (Kafka 4.0 EA)
- Tracks acknowledgment-based message backlog
- Monitors unacknowledged, released, and rejected messages
- Addresses the "zero lag fallacy" problem

#### Mode 3: Producer Metrics
- Tracks production rates and errors
- Monitors active producer counts
- Provides topic-level producer insights

#### Mode 4: Broker/Topic Health
- Monitors overall topic health and throughput
- Tracks partition counts and replication factors
- Identifies under-replicated partitions

### 3. Proper Entity Naming
Uses New Relic standard entity naming conventions:
- Topics: `entity:kafka:topic:{cluster}:{topic}`
- Consumer Groups: `entity:kafka:consumergroup:{cluster}:{group}:{topic}`
- Share Groups: `entity:kafka:sharegroup:{cluster}:{group}:{topic}`
- Brokers: `entity:kafka:broker:{cluster}:{broker_id}`

## Deployment Instructions

### Prerequisites
1. Kubernetes cluster with Kafka deployed
2. New Relic Infrastructure agent
3. Prometheus JMX exporter configured on Kafka brokers
4. Valid New Relic license key

### Step 1: Deploy the Enhanced OHI

```bash
# Apply the enhanced OHI configurations
kubectl apply -f kafka-enhanced-ohi-configmap.yaml
kubectl apply -f kafka-enhanced-ohi-deployment.yaml

# Verify deployment
kubectl get pods -n kafka-monitoring -l app=kafka-enhanced-ohi
```

### Step 2: Configure Collection Modes

Edit the ConfigMap to enable/disable specific collection modes:

```yaml
env:
  COLLECT_CONSUMER_GROUPS: "true"
  COLLECT_SHARE_GROUPS: "true"
  COLLECT_PRODUCERS: "true"
  COLLECT_BROKER_HEALTH: "true"
```

### Step 3: Customize Entity Configuration

```yaml
env:
  CLUSTER_NAME: "your-kafka-cluster"
  ENVIRONMENT: "production"
  REGION: "us-west-2"
  SERVICE_NAME: "your-service"
  CLOUD_PROVIDER: "aws"  # or "self-hosted", "gcp", etc.
```

## Testing the Implementation

### Local Testing
```bash
# Make the test script executable
chmod +x test-enhanced-ohi.sh

# Test the OHI script locally
./test-enhanced-ohi.sh local
```

### Deploy and Test
```bash
# Deploy the enhanced OHI
./test-enhanced-ohi.sh deploy

# Generate test data
./test-enhanced-ohi.sh test-data

# Verify metrics collection
./test-enhanced-ohi.sh verify
```

## Verification in New Relic

### 1. Basic Verification Query
```sql
SELECT count(*) 
FROM QueueSample 
WHERE provider = 'kafka' 
AND cluster.name = 'kafka-k8s-cluster'
SINCE 10 minutes ago
TIMESERIES
```

### 2. View All Collection Modes
```sql
SELECT uniqueCount(entityName) 
FROM QueueSample 
WHERE provider = 'kafka'
FACET CASES(
  WHERE share.group.name IS NOT NULL AS 'Share Groups',
  WHERE consumer.group.name IS NOT NULL AS 'Consumer Groups',
  WHERE producer.count > 0 AS 'Producers',
  WHERE broker.count > 0 AS 'Broker Health'
)
SINCE 1 hour ago
```

### 3. Consumer Lag Dashboard
```sql
SELECT average(queue.size) as 'Queue Size',
       average(consumer.lag.max) as 'Max Lag',
       average(messages.consumed.rate) as 'Consumption Rate'
FROM QueueSample 
WHERE provider = 'kafka' 
AND consumer.group.name IS NOT NULL
FACET consumer.group.name, topic.name
SINCE 30 minutes ago
TIMESERIES
```

### 4. Producer Performance
```sql
SELECT rate(sum(messages.published), 1 minute) as 'Production Rate',
       average(error.rate) as 'Error Rate',
       uniqueCount(producer.client.id) as 'Active Producers'
FROM QueueSample 
WHERE provider = 'kafka' 
AND messages.in.rate > 0
FACET topic.name
SINCE 1 hour ago
```

## Troubleshooting

### Check OHI Logs
```bash
# Get the pod name
POD=$(kubectl get pods -n kafka-monitoring -l app=kafka-enhanced-ohi -o jsonpath='{.items[0].metadata.name}')

# View logs
kubectl logs -n kafka-monitoring $POD

# Check for errors
kubectl logs -n kafka-monitoring $POD | grep -i error
```

### Validate Metrics Collection
```bash
# Execute OHI manually inside the pod
kubectl exec -n kafka-monitoring $POD -- /scripts/run-enhanced-ohi.sh | jq '.'
```

### Common Issues

1. **No metrics appearing**
   - Check Prometheus endpoint is accessible
   - Verify New Relic license key
   - Ensure Kafka JMX metrics are exposed

2. **Missing specific metrics**
   - Verify the metric exists in Prometheus
   - Check metric name mapping in the OHI script
   - Ensure collection mode is enabled

3. **Entity naming issues**
   - Verify CLUSTER_NAME environment variable
   - Check entity name format in events

## Performance Considerations

1. **Collection Interval**: Default is 30 seconds. Adjust based on your needs:
   ```yaml
   interval: 60s  # For less frequent collection
   ```

2. **Resource Limits**: The deployment includes resource limits:
   ```yaml
   resources:
     requests:
       memory: "256Mi"
       cpu: "100m"
     limits:
       memory: "512Mi"
       cpu: "200m"
   ```

3. **Metric Filtering**: You can disable unused collection modes to reduce overhead.

## Integration with Existing Monitoring

The enhanced OHI complements existing monitoring:
- **nri-kafka**: Continue using for traditional Kafka metrics
- **nri-flex**: Can be used alongside for custom metrics
- **Enhanced OHI**: Specifically for Queues & Streams UI

## Future Enhancements

1. **Auto-discovery**: Automatically discover topics and consumer groups
2. **Dynamic Thresholds**: Calculate baselines for anomaly detection
3. **Kafka Streams Support**: Add metrics for Kafka Streams applications
4. **Multi-cluster Support**: Monitor multiple Kafka clusters from one OHI

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review OHI logs for errors
3. Verify NRQL queries return data
4. Ensure all prerequisites are met