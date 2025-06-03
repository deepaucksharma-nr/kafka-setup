#!/usr/bin/env node

/**
 * Run Kafka-focused Discovery
 * Discovers Kafka metrics and creates intelligent dashboard
 */

const dotenv = require('dotenv');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { NerdGraphClient } = require('./src/core/api-client');
const IntelligentDashboardBuilder = require('./discovery-platform/lib/intelligent-dashboard-builder');

async function runKafkaDiscovery() {
  console.log(chalk.bold.blue('\n🔍 Running Kafka Discovery & Dashboard Generation\n'));
  
  const config = {
    accountId: process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID,
    apiKey: process.env.UKEY || process.env.NEW_RELIC_API_KEY,
    enableAnomalyDetection: true,
    enableCorrelations: true,
    enablePredictions: true
  };
  
  if (!config.accountId || !config.apiKey) {
    console.error(chalk.red('Missing account ID or API key'));
    process.exit(1);
  }
  
  console.log(chalk.gray(`Account: ${config.accountId}`));
  
  const client = new NerdGraphClient({
    apiKey: config.apiKey,
    region: 'US'
  });
  
  const spinner = ora('Discovering Kafka data...').start();
  
  try {
    // Step 1: Discover Kafka-related event types
    spinner.text = 'Discovering Kafka event types...';
    
    const eventTypeQuery = `
      SELECT count(*) 
      FROM KafkaBrokerSample, KafkaTopicSample, KafkaConsumerSample, 
           KafkaProducerSample, KafkaOffsetSample, SystemSample
      FACET eventType()
      SINCE 1 hour ago
    `;
    
    const eventTypeResult = await client.nrql(config.accountId, eventTypeQuery);
    const eventTypes = [];
    
    if (eventTypeResult?.results) {
      for (const result of eventTypeResult.results) {
        const eventTypeName = result.facet[0];
        const count = result.count;
        
        if (count > 0) {
          spinner.text = `Analyzing ${eventTypeName}...`;
          
          // Get attributes for this event type
          const attributeQuery = `
            SELECT keyset() 
            FROM ${eventTypeName} 
            SINCE 1 hour ago 
            LIMIT 1
          `;
          
          const attrResult = await client.nrql(config.accountId, attributeQuery);
          const attributes = attrResult?.results?.[0]?.['keyset()'] || [];
          
          // Get sample data
          const sampleQuery = `
            SELECT * 
            FROM ${eventTypeName} 
            LIMIT 1 
            SINCE 1 hour ago
          `;
          
          const sampleResult = await client.nrql(config.accountId, sampleQuery);
          const sample = sampleResult?.results?.[0] || {};
          
          // Build attribute list with types
          const typedAttributes = attributes
            .filter(attr => attr !== 'timestamp' && attr !== 'eventType')
            .map(attr => ({
              name: attr,
              type: typeof sample[attr],
              sampleValue: sample[attr]
            }));
          
          eventTypes.push({
            name: eventTypeName,
            count: count,
            volume: count,
            attributes: typedAttributes
          });
        }
      }
    }
    
    spinner.succeed(`Found ${eventTypes.length} event types with data`);
    
    // Display discovered event types
    console.log(chalk.white('\n📊 Discovered Event Types:'));
    eventTypes.forEach(et => {
      console.log(chalk.gray(`  • ${et.name}: ${et.count.toLocaleString()} events, ${et.attributes.length} attributes`));
    });
    
    // Step 2: Discover Kafka metrics
    spinner.start('Discovering Kafka metrics...');
    
    const metricsQuery = `
      SELECT uniques(metricName, 500) 
      FROM Metric 
      WHERE metricName LIKE '%kafka%' 
         OR metricName LIKE '%consumer%' 
         OR metricName LIKE '%producer%'
         OR metricName LIKE '%broker%'
         OR metricName LIKE '%topic%'
         OR metricName LIKE '%partition%'
         OR metricName LIKE '%replication%'
         OR metricName LIKE '%isr%'
         OR metricName LIKE '%lag%'
         OR metricName LIKE '%offset%'
         OR metricName LIKE '%newrelic.goldenmetrics.infra.kafka%'
      SINCE 1 hour ago
    `;
    
    const metricsResult = await client.nrql(config.accountId, metricsQuery);
    const metricNames = metricsResult?.results?.[0]?.['uniques.metricName'] || [];
    
    const metrics = metricNames.map(name => ({
      name,
      type: 'metric',
      unit: guessMetricUnit(name)
    }));
    
    spinner.succeed(`Found ${metrics.length} Kafka-related metrics`);
    
    if (metrics.length > 0) {
      console.log(chalk.white('\n📊 Sample Metrics:'));
      metrics.slice(0, 10).forEach(m => {
        console.log(chalk.gray(`  • ${m.name} (${m.unit})`));
      });
      if (metrics.length > 10) {
        console.log(chalk.gray(`  ... and ${metrics.length - 10} more`));
      }
    }
    
    // Step 3: Build discovery results
    const discoveryResults = {
      timestamp: new Date().toISOString(),
      accountId: config.accountId,
      eventTypes,
      metrics,
      relationships: []
    };
    
    // Add relationships if we have the data
    if (eventTypes.find(et => et.name === 'KafkaBrokerSample')) {
      discoveryResults.relationships.push({
        from: 'KafkaBrokerSample',
        to: 'SystemSample',
        type: 'runs_on'
      });
    }
    
    // Save discovery results
    const discoveryFile = path.join(__dirname, `kafka-discovery-${Date.now()}.json`);
    fs.writeFileSync(discoveryFile, JSON.stringify(discoveryResults, null, 2));
    console.log(chalk.gray(`\n💾 Discovery results saved to: ${discoveryFile}`));
    
    // Step 4: Generate intelligent dashboard
    console.log(chalk.yellow('\n📊 Generating intelligent dashboard...\n'));
    
    const builder = new IntelligentDashboardBuilder(config);
    const dashboardResult = await builder.buildDashboards(discoveryResults);
    
    console.log(chalk.green('✅ Intelligent dashboard created successfully!\n'));
    
    // Display results
    console.log(chalk.bold.white('📊 Dashboard Information:'));
    console.log(chalk.gray(`  • Name: ${dashboardResult.dashboard.name}`));
    console.log(chalk.gray(`  • GUID: ${dashboardResult.dashboard.guid}`));
    console.log(chalk.gray(`  • URL: ${dashboardResult.dashboard.url}`));
    
    // Display analysis
    if (dashboardResult.analysis) {
      console.log(chalk.bold.white('\n🔍 Analysis Results:'));
      
      // Categories
      console.log(chalk.white('\nMetric Categories:'));
      Object.entries(dashboardResult.analysis.categories).forEach(([category, items]) => {
        if (items.length > 0) {
          console.log(chalk.gray(`  • ${category}: ${items.length} metrics`));
        }
      });
      
      // Golden signals
      console.log(chalk.white('\nGolden Signals:'));
      Object.entries(dashboardResult.analysis.goldenSignals).forEach(([signal, metrics]) => {
        if (metrics.length > 0) {
          console.log(chalk.gray(`  • ${signal}: ${metrics.length} metrics`));
        }
      });
    }
    
    // Display insights
    if (dashboardResult.insights?.length > 0) {
      console.log(chalk.bold.white('\n💡 Insights:'));
      dashboardResult.insights.forEach(insight => {
        const icon = insight.severity === 'high' ? '🔴' : 
                    insight.severity === 'medium' ? '🟡' : '🟢';
        console.log(chalk.gray(`  ${icon} ${insight.message}`));
      });
    }
    
    // Save dashboard details
    const outputPath = path.join(__dirname, `kafka-intelligent-dashboard-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify({
      config: { accountId: config.accountId },
      discoveryResults: {
        eventTypesCount: eventTypes.length,
        metricsCount: metrics.length,
        eventTypes: eventTypes.map(et => ({ name: et.name, count: et.count }))
      },
      dashboard: dashboardResult.dashboard,
      analysis: dashboardResult.analysis,
      insights: dashboardResult.insights
    }, null, 2));
    
    console.log(chalk.gray(`\n💾 Dashboard details saved to: ${outputPath}`));
    
    console.log(chalk.bold.cyan('\n✨ Kafka discovery and dashboard generation complete!\n'));
    
  } catch (error) {
    spinner.fail('Discovery failed');
    console.error(chalk.red('\n❌ Error:'), error.message);
    
    if (error.stack) {
      console.error(chalk.gray('\nStack trace:'));
      console.error(chalk.gray(error.stack));
    }
    
    process.exit(1);
  }
}

function guessMetricUnit(metricName) {
  const name = metricName.toLowerCase();
  
  if (name.includes('persecond') || name.includes('rate')) return 'per_second';
  if (name.includes('percent') || name.includes('percentage')) return 'percent';
  if (name.includes('bytes')) return 'bytes';
  if (name.includes('milliseconds') || name.includes('ms')) return 'milliseconds';
  if (name.includes('seconds') || name.includes('sec')) return 'seconds';
  if (name.includes('count') || name.includes('total')) return 'count';
  if (name.includes('lag')) return 'count';
  if (name.includes('size')) return 'bytes';
  
  return 'unknown';
}

// Run the discovery
runKafkaDiscovery().catch(console.error);