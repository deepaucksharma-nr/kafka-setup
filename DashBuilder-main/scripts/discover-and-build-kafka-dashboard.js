#!/usr/bin/env node

/**
 * Discover Kafka Data and Build Dashboard
 * Focus on actual Kafka data without single-letter event types
 */

const dotenv = require('dotenv');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { NerdGraphClient } = require('./src/core/api-client');

async function discoverAndBuildKafkaDashboard() {
  console.log(chalk.bold.blue('\n🔍 Discovering Kafka Data and Building Dashboard\n'));
  
  const config = {
    accountId: process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID,
    apiKey: process.env.UKEY || process.env.NEW_RELIC_API_KEY
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
  
  const spinner = ora('Discovering data...').start();
  
  try {
    // Step 1: Check for Kafka broker data
    spinner.text = 'Checking for Kafka broker data...';
    
    const brokerQuery = `
      SELECT count(*), latest(entity.name), latest(broker.messagesInPerSecond)
      FROM KafkaBrokerSample 
      SINCE 1 hour ago
    `;
    
    const brokerResult = await client.nrql(config.accountId, brokerQuery);
    const hasBrokerData = brokerResult?.results?.[0]?.count > 0;
    
    if (hasBrokerData) {
      console.log(chalk.green('\n✅ Found Kafka broker data'));
      console.log(chalk.gray(`  • Events: ${brokerResult.results[0].count}`));
      console.log(chalk.gray(`  • Latest broker: ${brokerResult.results[0]['latest.entity.name'] || 'Unknown'}`));
      console.log(chalk.gray(`  • Messages/sec: ${brokerResult.results[0]['latest.broker.messagesInPerSecond'] || 0}`));
    } else {
      console.log(chalk.yellow('\n⚠️ No Kafka broker data found'));
    }
    
    // Step 2: Check for Kafka metrics
    spinner.text = 'Discovering Kafka metrics...';
    
    const metricsQuery = `
      SELECT uniques(metricName, 100) 
      FROM Metric 
      WHERE metricName LIKE '%kafka%' 
         OR metricName LIKE '%newrelic.goldenmetrics.infra.kafka%'
      SINCE 1 hour ago
    `;
    
    const metricsResult = await client.nrql(config.accountId, metricsQuery);
    const kafkaMetrics = metricsResult?.results?.[0]?.['uniques.metricName'] || [];
    
    console.log(chalk.green(`\n✅ Found ${kafkaMetrics.length} Kafka metrics`));
    
    if (kafkaMetrics.length > 0) {
      console.log(chalk.white('\nKafka Metrics:'));
      
      // Categorize metrics
      const goldenMetrics = kafkaMetrics.filter(m => m.includes('goldenmetrics'));
      const standardMetrics = kafkaMetrics.filter(m => !m.includes('goldenmetrics'));
      
      if (goldenMetrics.length > 0) {
        console.log(chalk.gray(`  • Golden Metrics: ${goldenMetrics.length}`));
        goldenMetrics.slice(0, 5).forEach(m => {
          const shortName = m.replace('newrelic.goldenmetrics.infra.kafkabroker.', '');
          console.log(chalk.gray(`    - ${shortName}`));
        });
      }
      
      if (standardMetrics.length > 0) {
        console.log(chalk.gray(`  • Standard Metrics: ${standardMetrics.length}`));
        standardMetrics.slice(0, 5).forEach(m => {
          console.log(chalk.gray(`    - ${m}`));
        });
      }
    }
    
    // Step 3: Check system data
    spinner.text = 'Checking system data...';
    
    const systemQuery = `
      SELECT count(*), average(cpuPercent), average(memoryUsedPercent)
      FROM SystemSample 
      SINCE 1 hour ago
    `;
    
    const systemResult = await client.nrql(config.accountId, systemQuery);
    const hasSystemData = systemResult?.results?.[0]?.count > 0;
    
    if (hasSystemData) {
      console.log(chalk.green('\n✅ Found system data'));
      console.log(chalk.gray(`  • Events: ${systemResult.results[0].count}`));
      console.log(chalk.gray(`  • Avg CPU: ${systemResult.results[0]['average.cpuPercent']?.toFixed(1)}%`));
      console.log(chalk.gray(`  • Avg Memory: ${systemResult.results[0]['average.memoryUsedPercent']?.toFixed(1)}%`));
    }
    
    spinner.succeed('Discovery completed');
    
    // Step 4: Build dashboard if we have data
    if (!hasBrokerData && kafkaMetrics.length === 0) {
      console.log(chalk.yellow('\n⚠️ No Kafka data found to create dashboard'));
      console.log(chalk.gray('\nTo generate Kafka data:'));
      console.log(chalk.gray('1. Deploy Kafka cluster: cd ../../kafka-monitoring && ./deploy.sh'));
      console.log(chalk.gray('2. Run test workload: ./deploy.sh test'));
      return;
    }
    
    console.log(chalk.yellow('\n📊 Building Kafka dashboard...\n'));
    
    const timestamp = new Date().toISOString().split('T')[0];
    const dashboard = {
      name: `Kafka Monitoring - ${timestamp}`,
      description: 'Auto-generated Kafka monitoring dashboard with discovered metrics',
      permissions: 'PUBLIC_READ_WRITE',
      pages: []
    };
    
    // Page 1: Overview
    const overviewPage = {
      name: 'Kafka Overview',
      description: 'Key Kafka metrics and health indicators',
      widgets: []
    };
    
    // Add summary widget
    overviewPage.widgets.push({
      title: '📊 Kafka Monitoring Overview',
      visualization: { id: 'viz.markdown' },
      layout: { column: 1, row: 1, height: 3, width: 4 },
      rawConfiguration: {
        text: `# Kafka Monitoring Dashboard

**Generated**: ${new Date().toISOString()}  
**Account**: ${config.accountId}

## Data Status
${hasBrokerData ? '✅ Kafka broker data available' : '⚠️ No Kafka broker data'}  
${kafkaMetrics.length > 0 ? `✅ ${kafkaMetrics.length} Kafka metrics found` : '⚠️ No Kafka metrics'}  
${hasSystemData ? '✅ System metrics available' : '⚠️ No system metrics'}

## Available Metrics
- Golden Metrics: ${kafkaMetrics.filter(m => m.includes('goldenmetrics')).length}
- Standard Metrics: ${kafkaMetrics.filter(m => !m.includes('goldenmetrics')).length}`
      }
    });
    
    let currentColumn = 5;
    let currentRow = 1;
    
    // Add broker metrics if available
    if (hasBrokerData) {
      overviewPage.widgets.push({
        title: '📈 Message Throughput',
        visualization: { id: 'viz.area' },
        layout: { column: currentColumn, row: currentRow, height: 3, width: 4 },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(config.accountId),
            query: `SELECT rate(sum(broker.messagesInPerSecond), 1 minute) as 'Messages/min' FROM KafkaBrokerSample TIMESERIES AUTO`
          }]
        }
      });
      
      currentColumn += 4;
      
      overviewPage.widgets.push({
        title: '⏱️ Request Latency',
        visualization: { id: 'viz.line' },
        layout: { column: currentColumn, row: currentRow, height: 3, width: 4 },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(config.accountId),
            query: `SELECT average(request.avgTimeFetch) as 'Fetch', average(request.avgTimeProduceRequest) as 'Produce' FROM KafkaBrokerSample TIMESERIES AUTO`
          }]
        }
      });
      
      currentRow = 4;
      currentColumn = 1;
      
      // Broker status table
      overviewPage.widgets.push({
        title: '🏥 Broker Health',
        visualization: { id: 'viz.table' },
        layout: { column: currentColumn, row: currentRow, height: 3, width: 12 },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(config.accountId),
            query: `SELECT latest(entity.name) as 'Broker', latest(broker.messagesInPerSecond) as 'Msg/sec', latest(request.handlerIdle) * 100 as 'Idle %', latest(replication.unreplicatedPartitions) as 'Unreplicated' FROM KafkaBrokerSample FACET entity.guid SINCE 10 minutes ago`
          }]
        }
      });
    }
    
    // Add golden metrics if available
    const goldenMetrics = kafkaMetrics.filter(m => m.includes('goldenmetrics'));
    if (goldenMetrics.length > 0) {
      const hasLeaderElection = goldenMetrics.some(m => m.includes('leaderElectionRate'));
      const hasFailedRequests = goldenMetrics.some(m => m.includes('failedProduceRequests'));
      const hasIncomingMessages = goldenMetrics.some(m => m.includes('incomingMessages'));
      
      if (hasLeaderElection || hasFailedRequests || hasIncomingMessages) {
        if (!hasBrokerData) {
          currentRow = 4;
          currentColumn = 1;
        } else {
          currentRow = 7;
        }
        
        if (hasLeaderElection) {
          overviewPage.widgets.push({
            title: '🔄 Leader Elections',
            visualization: { id: 'viz.line' },
            layout: { column: 1, row: currentRow, height: 3, width: 4 },
            rawConfiguration: {
              nrqlQueries: [{
                accountId: parseInt(config.accountId),
                query: `SELECT average(newrelic.goldenmetrics.infra.kafkabroker.leaderElectionRate) as 'Elections/sec' FROM Metric TIMESERIES AUTO`
              }]
            }
          });
        }
        
        if (hasFailedRequests) {
          overviewPage.widgets.push({
            title: '❌ Failed Requests',
            visualization: { id: 'viz.line' },
            layout: { column: 5, row: currentRow, height: 3, width: 4 },
            rawConfiguration: {
              nrqlQueries: [{
                accountId: parseInt(config.accountId),
                query: `SELECT sum(newrelic.goldenmetrics.infra.kafkabroker.failedProduceRequestsPerSecond) as 'Failed/sec' FROM Metric TIMESERIES AUTO`
              }]
            }
          });
        }
        
        if (hasIncomingMessages) {
          overviewPage.widgets.push({
            title: '📥 Incoming Messages',
            visualization: { id: 'viz.area' },
            layout: { column: 9, row: currentRow, height: 3, width: 4 },
            rawConfiguration: {
              nrqlQueries: [{
                accountId: parseInt(config.accountId),
                query: `SELECT average(newrelic.goldenmetrics.infra.kafkabroker.incomingMessagesPerSecond) as 'Messages/sec' FROM Metric TIMESERIES AUTO`
              }]
            }
          });
        }
      }
    }
    
    dashboard.pages.push(overviewPage);
    
    // Page 2: System Resources (if available)
    if (hasSystemData) {
      const systemPage = {
        name: 'System Resources',
        description: 'Server resource utilization',
        widgets: []
      };
      
      systemPage.widgets.push({
        title: '💻 Resource Utilization',
        visualization: { id: 'viz.line' },
        layout: { column: 1, row: 1, height: 3, width: 12 },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(config.accountId),
            query: `SELECT average(cpuPercent) as 'CPU %', average(memoryUsedPercent) as 'Memory %', average(diskUsedPercent) as 'Disk %' FROM SystemSample TIMESERIES AUTO`
          }]
        }
      });
      
      dashboard.pages.push(systemPage);
    }
    
    spinner.start('Deploying dashboard...');
    
    // Deploy the dashboard
    const result = await client.createDashboard(config.accountId, dashboard);
    
    spinner.succeed('Dashboard deployed successfully');
    
    const dashboardUrl = `https://one.newrelic.com/dashboards/${result.guid}`;
    
    console.log(chalk.green('\n✅ Kafka Dashboard Created!\n'));
    console.log(chalk.white('Dashboard Details:'));
    console.log(chalk.gray(`  • Name: ${result.name}`));
    console.log(chalk.gray(`  • GUID: ${result.guid}`));
    console.log(chalk.gray(`  • Pages: ${dashboard.pages.length}`));
    console.log(chalk.gray(`  • URL: ${dashboardUrl}\n`));
    
    // Save configuration
    const outputPath = path.join(__dirname, `kafka-dashboard-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify({
      dashboard,
      result,
      url: dashboardUrl,
      discovery: {
        hasBrokerData,
        kafkaMetricsCount: kafkaMetrics.length,
        hasSystemData,
        timestamp: new Date().toISOString()
      }
    }, null, 2));
    
    console.log(chalk.gray(`💾 Configuration saved to: ${outputPath}\n`));
    
    console.log(chalk.bold.cyan('🎉 Your Kafka dashboard is ready!\n'));
    
  } catch (error) {
    spinner.fail('Operation failed');
    console.error(chalk.red('\n❌ Error:'), error.message);
    
    if (error.message.includes('permission')) {
      console.log(chalk.yellow('\n🔧 Permission Issue:'));
      console.log(chalk.gray('  • Verify API key has dashboard creation permissions'));
      console.log(chalk.gray('  • Check that the account ID is correct'));
    } else if (error.message.includes('An error occurred')) {
      console.log(chalk.yellow('\n🔧 API Issue:'));
      console.log(chalk.gray('  • The dashboard API may be experiencing issues'));
      console.log(chalk.gray('  • Try using the final dashboard script instead:'));
      console.log(chalk.gray('    node create-final-dashboard.js'));
    }
    
    process.exit(1);
  }
}

// Run the discovery and dashboard creation
discoverAndBuildKafkaDashboard().catch(console.error);