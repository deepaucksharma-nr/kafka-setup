#!/usr/bin/env node

/**
 * Test metric categorization
 */

const chalk = require('chalk');

// Test patterns
const metricPatterns = {
  throughput: /(throughput|rate|persecond|PerSecond|persec|ops|tps|rps|qps|messages|MessagesIn|MessagesOut)/i,
  latency: /(latency|duration|time|Time|delay|response|wait|avgTime|Percentile)/i,
  error: /(error|Error|fail|Failed|exception|timeout|reject|invalid|expired|Expired)/i,
  utilization: /(percent|Percent|percentage|usage|utilization|ratio|cpu|memory|disk|Idle|idle)/i,
  count: /(count|Count|total|sum|number|size|length|lag|Lag|unacked|partition|Partitions)/i,
  gauge: /(current|active|open|pending|queue|backlog|state|State)/i,
  bytes: /(bytes|Bytes|size|memory|storage|bandwidth|BytesIn|BytesOut)/i,
  connection: /(connection|Connection|session|socket|client|thread)/i,
  replication: /(replication|Replication|replica|isr|ISR|leader|Leader|election|Election|unreplicated)/i
};

function categorizeMetric(metricName) {
  console.log(chalk.yellow(`\nTesting: ${metricName}`));
  
  for (const [category, pattern] of Object.entries(metricPatterns)) {
    const matches = pattern.test(metricName);
    if (matches) {
      console.log(chalk.green(`  ✓ Matches ${category}: ${pattern}`));
      return category;
    } else {
      console.log(chalk.gray(`  - No match for ${category}`));
    }
  }
  console.log(chalk.red(`  ✗ No category matched!`));
  return 'other';
}

// Test metrics
const testMetrics = [
  'broker.messagesInPerSecond',
  'broker.bytesInPerSecond', 
  'broker.bytesOutPerSecond',
  'request.avgTimeFetch',
  'request.avgTimeProduceRequest',
  'request.produceRequestsFailedPerSecond',
  'request.handlerIdle',
  'replication.unreplicatedPartitions',
  'consumer.requestsExpiredPerSecond',
  'connection.count',
  'cpuPercent',
  'memoryUsedPercent',
  'diskUsedPercent',
  'kafka_sharegroup_records_unacked',
  'kafka_consumer_ConsumerLag'
];

console.log(chalk.bold.blue('Testing Metric Categorization\n'));

const results = {};
for (const metric of testMetrics) {
  const category = categorizeMetric(metric);
  results[metric] = category;
}

console.log(chalk.bold.white('\n\nSummary:\n'));
for (const [metric, category] of Object.entries(results)) {
  const icon = category === 'other' ? '❌' : '✅';
  console.log(chalk.gray(`${icon} ${metric} → ${category}`));
}

// Group by category
const byCategory = {};
for (const [metric, category] of Object.entries(results)) {
  if (!byCategory[category]) byCategory[category] = [];
  byCategory[category].push(metric);
}

console.log(chalk.bold.white('\n\nBy Category:\n'));
for (const [category, metrics] of Object.entries(byCategory)) {
  console.log(chalk.yellow(`${category}: ${metrics.length} metrics`));
  metrics.forEach(m => console.log(chalk.gray(`  • ${m}`)));
}