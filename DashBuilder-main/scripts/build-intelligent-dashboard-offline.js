#!/usr/bin/env node

/**
 * Build Intelligent Dashboard Offline
 * Uses pre-discovered data to build dashboard without additional API calls
 */

const dotenv = require('dotenv');
const path = require('path');
const chalk = require('chalk');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { NerdGraphClient } = require('./src/core/api-client');

// Mock logger to avoid issues
const mockLogger = {
  info: (msg, ...args) => console.log(chalk.gray(`[INFO] ${msg}`)),
  warn: (msg, ...args) => console.log(chalk.yellow(`[WARN] ${msg}`)),
  error: (msg, ...args) => console.log(chalk.red(`[ERROR] ${msg}`)),
  debug: () => {}
};

// Import the original IntelligentDashboardBuilder
const OriginalBuilder = require('./discovery-platform/lib/intelligent-dashboard-builder');

// Create a modified version that doesn't make API calls
class OfflineIntelligentDashboardBuilder extends OriginalBuilder {
  async analyzeEventType(eventType) {
    // Return the event type data without making API calls
    return {
      name: eventType.name,
      attributes: eventType.attributes || [],
      volume: eventType.count || eventType.volume,
      timeRange: { start: new Date(Date.now() - 3600000), end: new Date() }
    };
  }
  
  async estimateCardinality(eventType, attribute) {
    // Return a reasonable estimate without API calls
    if (attribute.includes('name') || attribute.includes('id')) return 10;
    if (attribute.includes('Percent')) return 100;
    return 'unknown';
  }
  
  async detectCorrelations(analysis) {
    // Use the parent implementation but without API calls
    const correlations = {
      strong: [],
      moderate: [],
      inverse: []
    };
    
    // Find metrics that typically correlate
    const correlationPatterns = [
      { pattern1: /request.*rate/i, pattern2: /error.*rate/i, type: 'error_rate' },
      { pattern1: /cpu.*percent/i, pattern2: /memory.*percent/i, type: 'resource' },
      { pattern1: /throughput|messagesInPerSecond/i, pattern2: /latency|avgTime/i, type: 'performance' },
      { pattern1: /bytesIn/i, pattern2: /bytesOut/i, type: 'traffic' },
      { pattern1: /Failed/i, pattern2: /Expired/i, type: 'errors' }
    ];
    
    for (const category of Object.values(analysis.categories)) {
      for (const metric1 of category) {
        for (const metric2 of category) {
          if (metric1 !== metric2) {
            for (const pattern of correlationPatterns) {
              const name1 = metric1.attribute || metric1.metricName || '';
              const name2 = metric2.attribute || metric2.metricName || '';
              
              if (pattern.pattern1.test(name1) && pattern.pattern2.test(name2)) {
                correlations.strong.push({
                  metric1: name1,
                  metric2: name2,
                  type: pattern.type,
                  confidence: 0.8
                });
              }
            }
          }
        }
      }
    }
    
    return correlations;
  }
  
  // Override to skip actual deployment
  async deployDashboard(dashboardConfig) {
    console.log(chalk.yellow('\n📊 Dashboard Configuration (Not Deployed):'));
    
    // Instead of deploying, just return a mock result
    return {
      guid: 'MOCK-GUID-' + Date.now(),
      name: dashboardConfig.name,
      url: 'https://one.newrelic.com/dashboards/MOCK-DASHBOARD'
    };
  }
}

async function buildIntelligentDashboardOffline() {
  console.log(chalk.bold.blue('\n🧠 Building Intelligent Dashboard (Offline Mode)\n'));
  
  const config = {
    accountId: process.env.ACC || process.env.NEW_RELIC_ACCOUNT_ID || '3630072',
    apiKey: process.env.UKEY || process.env.NEW_RELIC_API_KEY || 'mock-key',
    enableAnomalyDetection: true,
    enableCorrelations: true,
    enablePredictions: true
  };
  
  try {
    // Create comprehensive discovery results
    const discoveryResults = {
      timestamp: new Date().toISOString(),
      accountId: config.accountId,
      eventTypes: [
        {
          name: 'KafkaBrokerSample',
          count: 126,
          volume: 126,
          attributes: [
            { name: 'broker.messagesInPerSecond', type: 'number' },
            { name: 'broker.bytesInPerSecond', type: 'number' },
            { name: 'broker.bytesOutPerSecond', type: 'number' },
            { name: 'broker.IOInPerSecond', type: 'number' },
            { name: 'broker.IOOutPerSecond', type: 'number' },
            { name: 'request.avgTimeFetch', type: 'number' },
            { name: 'request.avgTimeProduceRequest', type: 'number' },
            { name: 'request.produceRequestsFailedPerSecond', type: 'number' },
            { name: 'request.clientFetchesFailedPerSecond', type: 'number' },
            { name: 'request.handlerIdle', type: 'number' },
            { name: 'replication.unreplicatedPartitions', type: 'number' },
            { name: 'replication.isrShrinksPerSecond', type: 'number' },
            { name: 'replication.isrExpandsPerSecond', type: 'number' },
            { name: 'consumer.requestsExpiredPerSecond', type: 'number' },
            { name: 'connection.count', type: 'number' },
            { name: 'net.bytesRejectedPerSecond', type: 'number' }
          ]
        },
        {
          name: 'SystemSample',
          count: 68,
          volume: 68,
          attributes: [
            { name: 'cpuPercent', type: 'number' },
            { name: 'memoryUsedPercent', type: 'number' },
            { name: 'diskUsedPercent', type: 'number' },
            { name: 'networkReceiveBytesPerSecond', type: 'number' },
            { name: 'networkTransmitBytesPerSecond', type: 'number' }
          ]
        }
      ],
      metrics: [
        { name: 'newrelic.goldenmetrics.infra.kafkabroker.leaderElectionRate', type: 'metric', unit: 'per_second' },
        { name: 'newrelic.goldenmetrics.infra.kafkabroker.produceRequestDuration99PercentileS', type: 'metric', unit: 'seconds' },
        { name: 'newrelic.goldenmetrics.infra.kafkabroker.failedProduceRequestsPerSecond', type: 'metric', unit: 'per_second' },
        { name: 'newrelic.goldenmetrics.infra.kafkabroker.incomingMessagesPerSecond', type: 'metric', unit: 'per_second' }
      ]
    };
    
    console.log(chalk.white('📊 Discovery Data:'));
    console.log(chalk.gray(`  • Event Types: ${discoveryResults.eventTypes.length}`));
    console.log(chalk.gray(`  • Total Attributes: ${discoveryResults.eventTypes.reduce((sum, et) => sum + et.attributes.length, 0)}`));
    console.log(chalk.gray(`  • Metrics: ${discoveryResults.metrics.length}`));
    
    // Initialize offline builder
    const builder = new OfflineIntelligentDashboardBuilder(config);
    
    // Build dashboards
    console.log(chalk.yellow('\n📊 Building intelligent dashboard...\n'));
    const result = await builder.buildDashboards(discoveryResults);
    
    console.log(chalk.green('✅ Intelligent dashboard built successfully!\n'));
    
    // Display analysis
    console.log(chalk.white('📊 Metric Categorization:'));
    let totalCategorized = 0;
    for (const [category, metrics] of Object.entries(result.analysis.categories)) {
      if (metrics.length > 0) {
        const icon = builder.getCategoryIcon(category);
        console.log(chalk.gray(`  • ${icon} ${category}: ${metrics.length} metrics`));
        totalCategorized += metrics.length;
      }
    }
    
    // Show golden signals
    console.log(chalk.white('\n🚦 Golden Signals:'));
    for (const [signal, metrics] of Object.entries(result.analysis.goldenSignals)) {
      if (metrics.length > 0) {
        console.log(chalk.gray(`  • ${signal}: ${metrics.length} metrics`));
      }
    }
    
    // Show correlations
    if (result.correlations.strong.length > 0) {
      console.log(chalk.white('\n🔗 Correlations:'));
      result.correlations.strong.slice(0, 5).forEach(corr => {
        console.log(chalk.gray(`  • ${corr.metric1} ↔ ${corr.metric2}`));
      });
    }
    
    // Build dashboard configuration
    const dashboardPlan = builder.generateDashboardPlan(result.analysis, result.correlations);
    const widgetPages = await builder.createOptimizedWidgets(dashboardPlan, result.analysis);
    const dashboardConfig = builder.buildDashboardConfig(widgetPages, result.analysis);
    
    console.log(chalk.white('\n📈 Dashboard Structure:'));
    console.log(chalk.gray(`  • Name: ${dashboardConfig.name}`));
    console.log(chalk.gray(`  • Pages: ${dashboardConfig.pages.length}`));
    
    dashboardConfig.pages.forEach(page => {
      console.log(chalk.gray(`\n  Page: ${page.name}`));
      console.log(chalk.gray(`    • Widgets: ${page.widgets.length}`));
      
      // Count widget types
      const widgetTypes = {};
      page.widgets.forEach(w => {
        const viz = w.visualization?.id || 'unknown';
        widgetTypes[viz] = (widgetTypes[viz] || 0) + 1;
      });
      
      Object.entries(widgetTypes).forEach(([viz, count]) => {
        console.log(chalk.gray(`    • ${viz}: ${count}`));
      });
    });
    
    // Verify catalog page
    const catalogPage = dashboardConfig.pages.find(p => p.name === 'All Metrics Catalog');
    console.log(chalk.white('\n📚 Dynamic Features:'));
    console.log(chalk.gray(`  ${catalogPage ? '✅' : '❌'} Dynamic metrics catalog page`));
    
    if (catalogPage) {
      console.log(chalk.gray(`  • Catalog widgets: ${catalogPage.widgets.length}`));
      
      // Show sample catalog widgets
      console.log(chalk.gray('\n  Sample Catalog Widgets:'));
      catalogPage.widgets.slice(0, 5).forEach(w => {
        console.log(chalk.gray(`    - ${w.title}`));
      });
    }
    
    // Save the full dashboard configuration
    const outputFile = path.join(__dirname, `intelligent-dashboard-config-${Date.now()}.json`);
    fs.writeFileSync(outputFile, JSON.stringify({
      dashboardConfig,
      analysis: result.analysis,
      correlations: result.correlations,
      insights: result.insights
    }, null, 2));
    
    console.log(chalk.gray(`\n💾 Dashboard configuration saved to: ${outputFile}`));
    
    // Now deploy if we have a real API key
    if (config.apiKey && config.apiKey !== 'mock-key') {
      console.log(chalk.yellow('\n📤 Deploying dashboard to New Relic...\n'));
      
      const client = new NerdGraphClient({
        apiKey: config.apiKey,
        region: 'US'
      });
      
      try {
        const deployed = await client.createDashboard(config.accountId, dashboardConfig);
        
        console.log(chalk.green('✅ Dashboard deployed successfully!\n'));
        console.log(chalk.white('Dashboard Details:'));
        console.log(chalk.gray(`  • Name: ${deployed.name}`));
        console.log(chalk.gray(`  • GUID: ${deployed.guid}`));
        console.log(chalk.gray(`  • URL: https://one.newrelic.com/dashboards/${deployed.guid}\n`));
        
      } catch (error) {
        console.log(chalk.yellow('⚠️ Dashboard deployment failed, but configuration was saved'));
        console.log(chalk.gray(`Error: ${error.message}`));
      }
    }
    
    console.log(chalk.bold.cyan('\n✨ Intelligent dashboard with all features is ready!\n'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Error:'), error.message);
    console.error(chalk.gray('\nStack trace:'), error.stack);
    process.exit(1);
  }
}

// Run the offline builder
buildIntelligentDashboardOffline().catch(console.error);