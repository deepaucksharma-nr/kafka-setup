#!/usr/bin/env node

/**
 * Test Dynamic Metrics Catalog Generation (Offline)
 * Tests catalog generation without making API calls
 */

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

// Mock the logger to avoid import issues
const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {}
};

// Create a test-specific version of IntelligentDashboardBuilder
class TestIntelligentDashboardBuilder {
  constructor(config = {}) {
    this.config = config;
    
    // Copy metric patterns and visualization matrix from original
    this.metricPatterns = {
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
    
    this.visualizationMatrix = {
      throughput: { primary: 'line', secondary: 'area', tertiary: 'billboard' },
      latency: { primary: 'line', secondary: 'histogram', tertiary: 'heatmap' },
      error: { primary: 'line', secondary: 'bar', tertiary: 'billboard' },
      utilization: { primary: 'line', secondary: 'gauge', tertiary: 'billboard' },
      count: { primary: 'billboard', secondary: 'bar', tertiary: 'table' },
      gauge: { primary: 'billboard', secondary: 'gauge', tertiary: 'line' },
      bytes: { primary: 'area', secondary: 'line', tertiary: 'billboard' },
      connection: { primary: 'line', secondary: 'area', tertiary: 'table' },
      replication: { primary: 'line', secondary: 'billboard', tertiary: 'table' },
      business: { primary: 'billboard', secondary: 'pie', tertiary: 'funnel' }
    };
  }

  analyzeMetrics(discoveryResults) {
    const analysis = {
      eventTypes: {},
      metrics: {},
      categories: {},
      timeSeries: [],
      aggregations: [],
      dimensions: [],
      goldenSignals: {
        latency: [],
        traffic: [],
        errors: [],
        saturation: []
      }
    };
    
    // Analyze event types
    if (discoveryResults.eventTypes) {
      for (const eventType of discoveryResults.eventTypes) {
        // Use provided attributes directly without API calls
        analysis.eventTypes[eventType.name] = {
          name: eventType.name,
          attributes: eventType.attributes || [],
          volume: eventType.count
        };
        
        // Categorize metrics
        for (const attribute of eventType.attributes || []) {
          const category = this.categorizeMetric(attribute.name);
          if (!analysis.categories[category]) {
            analysis.categories[category] = [];
          }
          analysis.categories[category].push({
            eventType: eventType.name,
            attribute: attribute.name,
            type: attribute.type
          });
          
          // Map to golden signals
          this.mapToGoldenSignals(attribute, eventType.name, analysis.goldenSignals);
        }
      }
    }
    
    // Analyze standalone metrics
    if (discoveryResults.metrics) {
      for (const metric of discoveryResults.metrics) {
        analysis.metrics[metric.name] = {
          name: metric.name,
          type: metric.type || 'gauge',
          unit: metric.unit || 'unknown',
          category: this.categorizeMetric(metric.name)
        };
        
        const category = this.categorizeMetric(metric.name);
        if (!analysis.categories[category]) {
          analysis.categories[category] = [];
        }
        analysis.categories[category].push({
          metricName: metric.name,
          type: 'metric',
          unit: metric.unit
        });
      }
    }
    
    return analysis;
  }

  categorizeMetric(metricName) {
    // Check patterns in priority order
    const priorityOrder = ['error', 'latency', 'bytes', 'replication', 'utilization', 'count', 'throughput', 'connection', 'gauge'];
    
    for (const category of priorityOrder) {
      if (this.metricPatterns[category] && this.metricPatterns[category].test(metricName)) {
        return category;
      }
    }
    
    // Check remaining patterns
    for (const [category, pattern] of Object.entries(this.metricPatterns)) {
      if (!priorityOrder.includes(category) && pattern.test(metricName)) {
        return category;
      }
    }
    
    return 'other';
  }

  mapToGoldenSignals(attribute, eventType, goldenSignals) {
    const name = attribute.name.toLowerCase();
    const fullName = `${eventType}.${attribute.name}`;
    
    if (this.metricPatterns.latency.test(name) && attribute.type === 'number') {
      goldenSignals.latency.push(fullName);
    }
    
    if (this.metricPatterns.throughput.test(name) || 
        name.includes('request') || name.includes('message')) {
      goldenSignals.traffic.push(fullName);
    }
    
    if (this.metricPatterns.error.test(name)) {
      goldenSignals.errors.push(fullName);
    }
    
    if (this.metricPatterns.utilization.test(name) || 
        name.includes('queue') || name.includes('pending')) {
      goldenSignals.saturation.push(fullName);
    }
  }

  buildMetricsCatalogPage(analysis) {
    const widgets = [];
    let currentRow = 1;
    
    // Overview widget
    widgets.push({
      title: '📚 Complete Metrics Catalog',
      visualization: { id: 'viz.markdown' },
      layout: { column: 1, row: currentRow, height: 2, width: 12 },
      rawConfiguration: {
        text: this.generateCatalogOverview(analysis)
      }
    });
    
    currentRow += 2;
    
    // Generate widgets for each category
    for (const [category, metrics] of Object.entries(analysis.categories)) {
      if (metrics.length === 0) continue;
      
      const categoryWidgets = this.createCategoryWidgets(category, metrics, analysis, currentRow);
      widgets.push(...categoryWidgets);
      
      // Update row position
      const maxRow = Math.max(...categoryWidgets.map(w => w.layout.row + w.layout.height));
      currentRow = maxRow + 1;
    }
    
    // Add comprehensive metrics table
    widgets.push(this.createMetricsTable(analysis, currentRow));
    
    return {
      name: 'All Metrics Catalog',
      description: 'Complete catalog of discovered metrics organized by intelligent categorization',
      widgets
    };
  }

  generateCatalogOverview(analysis) {
    const totalMetrics = Object.values(analysis.categories).reduce((sum, arr) => sum + arr.length, 0);
    const eventTypeCount = Object.keys(analysis.eventTypes).length;
    const categoryCount = Object.keys(analysis.categories).length;
    
    let text = `# Complete Metrics Catalog

**Discovery Summary**
- Total Metrics: ${totalMetrics}
- Event Types: ${eventTypeCount}
- Categories: ${categoryCount}

**Intelligent Categorization Applied**
`;
    
    for (const [category, metrics] of Object.entries(analysis.categories)) {
      if (metrics.length > 0) {
        text += `- **${this.formatCategoryName(category)}**: ${metrics.length} metrics\\n`;
      }
    }
    
    text += `\\n**Visualization Types**: Each category uses optimal chart types based on metric characteristics.`;
    
    return text;
  }

  createCategoryWidgets(category, metrics, analysis, startRow) {
    const widgets = [];
    const vizType = this.visualizationMatrix[category] || { primary: 'line' };
    
    // Group metrics by event type
    const metricsByEventType = {};
    for (const metric of metrics) {
      const eventType = metric.eventType || 'Metric';
      if (!metricsByEventType[eventType]) {
        metricsByEventType[eventType] = [];
      }
      metricsByEventType[eventType].push(metric);
    }
    
    let column = 1;
    let row = startRow;
    
    for (const [eventType, eventMetrics] of Object.entries(metricsByEventType)) {
      // Create widget for this group
      const widget = this.createDynamicWidget(
        category,
        eventType,
        eventMetrics,
        vizType.primary,
        { column, row }
      );
      
      if (widget) {
        widgets.push(widget);
        
        // Update position
        column += widget.layout.width;
        if (column > 12) {
          column = 1;
          row += 3;
        }
      }
    }
    
    return widgets;
  }

  createDynamicWidget(category, eventType, metrics, vizType, position) {
    if (metrics.length === 0) return null;
    
    const { column, row } = position;
    const width = this.calculateOptimalWidth(metrics.length, vizType);
    
    // Build NRQL query dynamically
    const query = this.buildDynamicQuery(category, eventType, metrics);
    
    return {
      title: `${this.getCategoryIcon(category)} ${this.formatCategoryName(category)} - ${eventType}`,
      visualization: { id: `viz.${vizType}` },
      layout: { column, row, height: 3, width },
      rawConfiguration: {
        nrqlQueries: [{
          accountId: parseInt(this.config.accountId),
          query
        }]
      }
    };
  }

  buildDynamicQuery(category, eventType, metrics) {
    const aggregations = [];
    
    // Build appropriate aggregations based on category
    for (const metric of metrics.slice(0, 5)) { // Limit to 5 metrics per widget
      const attribute = metric.attribute || metric.metricName;
      const alias = this.formatMetricAlias(attribute);
      
      switch (category) {
        case 'throughput':
        case 'bytes':
          aggregations.push(`rate(sum(${attribute}), 1 minute) as '${alias}/min'`);
          break;
        case 'latency':
          aggregations.push(`percentile(${attribute}, 95) as '${alias} P95'`);
          break;
        case 'error':
          aggregations.push(`sum(${attribute}) as '${alias}'`);
          break;
        case 'utilization':
          aggregations.push(`average(${attribute}) as '${alias}'`);
          break;
        case 'count':
          aggregations.push(`sum(${attribute}) as '${alias}'`);
          break;
        case 'gauge':
          aggregations.push(`latest(${attribute}) as '${alias}'`);
          break;
        default:
          aggregations.push(`average(${attribute}) as '${alias}'`);
      }
    }
    
    // Determine if time series is appropriate
    const useTimeSeries = ['throughput', 'latency', 'error', 'bytes'].includes(category);
    
    if (eventType === 'Metric') {
      return `SELECT ${aggregations.join(', ')} FROM Metric WHERE metricName IN (${metrics.map(m => `'${m.metricName}'`).join(', ')}) ${useTimeSeries ? 'TIMESERIES AUTO' : ''} SINCE 1 hour ago`;
    } else {
      return `SELECT ${aggregations.join(', ')} FROM ${eventType} ${useTimeSeries ? 'TIMESERIES AUTO' : ''} SINCE 1 hour ago`;
    }
  }

  createMetricsTable(analysis, startRow) {
    // Build a comprehensive list of all metrics
    const allMetrics = [];
    
    for (const [category, metrics] of Object.entries(analysis.categories)) {
      for (const metric of metrics) {
        allMetrics.push({
          name: metric.attribute || metric.metricName,
          eventType: metric.eventType || 'Metric',
          category,
          type: metric.type || 'gauge'
        });
      }
    }
    
    // Create table query
    const query = this.buildMetricsTableQuery(allMetrics);
    
    return {
      title: '📊 All Metrics Summary Table',
      visualization: { id: 'viz.table' },
      layout: { column: 1, row: startRow, height: 5, width: 12 },
      rawConfiguration: {
        nrqlQueries: [{
          accountId: parseInt(this.config.accountId),
          query
        }]
      }
    };
  }

  buildMetricsTableQuery(allMetrics) {
    // Group by event type for efficient querying
    const metricsByEventType = {};
    for (const metric of allMetrics) {
      if (!metricsByEventType[metric.eventType]) {
        metricsByEventType[metric.eventType] = [];
      }
      metricsByEventType[metric.eventType].push(metric);
    }
    
    // For simplicity, create a table showing current values
    const selections = [];
    
    for (const [eventType, metrics] of Object.entries(metricsByEventType)) {
      if (eventType === 'Metric') continue; // Skip Metric type for table
      
      // Add top 3 metrics from each event type
      for (const metric of metrics.slice(0, 3)) {
        selections.push(`latest(${metric.name}) as '${this.formatMetricAlias(metric.name)}'`);
      }
    }
    
    if (selections.length === 0) {
      // Fallback if no suitable metrics
      return `SELECT count(*) as 'Total Events' FROM Transaction SINCE 5 minutes ago`;
    }
    
    // Create a comprehensive query
    const mainEventType = Object.keys(metricsByEventType).find(et => et !== 'Metric') || 'Transaction';
    
    return `SELECT ${selections.join(', ')} FROM ${mainEventType} SINCE 5 minutes ago LIMIT 100`;
  }

  formatCategoryName(category) {
    return category.charAt(0).toUpperCase() + category.slice(1) + ' Metrics';
  }

  getCategoryIcon(category) {
    const icons = {
      throughput: '📈',
      latency: '⏱️',
      error: '❌',
      utilization: '🔥',
      count: '🔢',
      gauge: '🎯',
      bytes: '💾',
      connection: '🔌',
      replication: '🔄',
      business: '💼'
    };
    return icons[category] || '📊';
  }

  formatMetricAlias(metricName) {
    return metricName
      .split('.')
      .pop()
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]/g, ' ')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  calculateOptimalWidth(metricCount, vizType) {
    if (vizType === 'billboard') {
      return Math.min(4, metricCount * 2);
    }
    if (vizType === 'table') {
      return 12;
    }
    return metricCount > 3 ? 8 : 6;
  }
}

// Main test function
async function testCatalogGeneration() {
  console.log(chalk.bold.blue('\n🧪 Testing Dynamic Metrics Catalog Generation (Offline)\n'));
  
  const config = {
    accountId: '3630072',
    apiKey: 'test-key'
  };
  
  try {
    // Create sample discovery results
    const discoveryResults = {
      timestamp: new Date().toISOString(),
      accountId: config.accountId,
      eventTypes: [
        {
          name: 'KafkaBrokerSample',
          count: 1000,
          attributes: [
            { name: 'broker.messagesInPerSecond', type: 'number' },
            { name: 'broker.bytesInPerSecond', type: 'number' },
            { name: 'broker.bytesOutPerSecond', type: 'number' },
            { name: 'request.avgTimeFetch', type: 'number' },
            { name: 'request.avgTimeProduceRequest', type: 'number' },
            { name: 'request.produceRequestsFailedPerSecond', type: 'number' },
            { name: 'request.handlerIdle', type: 'number' },
            { name: 'replication.unreplicatedPartitions', type: 'number' },
            { name: 'consumer.requestsExpiredPerSecond', type: 'number' },
            { name: 'connection.count', type: 'number' }
          ]
        },
        {
          name: 'SystemSample',
          count: 2000,
          attributes: [
            { name: 'cpuPercent', type: 'number' },
            { name: 'memoryUsedPercent', type: 'number' },
            { name: 'diskUsedPercent', type: 'number' }
          ]
        }
      ],
      metrics: [
        { name: 'kafka_sharegroup_records_unacked', type: 'metric', unit: 'count' },
        { name: 'kafka_consumer_ConsumerLag', type: 'metric', unit: 'count' }
      ]
    };
    
    console.log(chalk.white('📊 Test Data:'));
    console.log(chalk.gray(`  • Event Types: ${discoveryResults.eventTypes.length}`));
    console.log(chalk.gray(`  • Total Attributes: ${discoveryResults.eventTypes.reduce((sum, et) => sum + et.attributes.length, 0)}`));
    console.log(chalk.gray(`  • Metrics: ${discoveryResults.metrics.length}`));
    
    // Initialize builder
    const builder = new TestIntelligentDashboardBuilder(config);
    
    // Analyze metrics
    console.log(chalk.yellow('\n📊 Analyzing metrics...'));
    const analysis = builder.analyzeMetrics(discoveryResults);
    
    console.log(chalk.white('\nAnalysis Results:'));
    console.log(chalk.gray('Categories:'));
    Object.entries(analysis.categories).forEach(([category, metrics]) => {
      if (metrics.length > 0) {
        console.log(chalk.gray(`  • ${category}: ${metrics.length} metrics`));
      }
    });
    
    // Build catalog page
    console.log(chalk.yellow('\n📊 Building catalog page...'));
    const catalogPage = builder.buildMetricsCatalogPage(analysis);
    
    console.log(chalk.bold.green('\n✅ Dynamic Catalog Page Generated!\n'));
    console.log(chalk.white('Catalog Details:'));
    console.log(chalk.gray(`  • Name: ${catalogPage.name}`));
    console.log(chalk.gray(`  • Description: ${catalogPage.description}`));
    console.log(chalk.gray(`  • Total Widgets: ${catalogPage.widgets.length}`));
    
    // Analyze widgets
    const widgetTypes = {};
    const widgetTitles = [];
    
    catalogPage.widgets.forEach(widget => {
      const vizType = widget.visualization?.id || 'unknown';
      widgetTypes[vizType] = (widgetTypes[vizType] || 0) + 1;
      widgetTitles.push(widget.title);
    });
    
    console.log(chalk.white('\nWidget Analysis:'));
    console.log(chalk.gray('By Visualization Type:'));
    Object.entries(widgetTypes).forEach(([viz, count]) => {
      console.log(chalk.gray(`  • ${viz}: ${count}`));
    });
    
    console.log(chalk.gray('\nWidget Titles:'));
    widgetTitles.forEach(title => {
      console.log(chalk.gray(`  • ${title}`));
    });
    
    // Sample widget details
    console.log(chalk.white('\n📋 Sample Widget:'));
    const sampleWidget = catalogPage.widgets.find(w => w.visualization?.id !== 'viz.markdown' && w.visualization?.id !== 'viz.table');
    if (sampleWidget) {
      console.log(chalk.gray(`  Title: ${sampleWidget.title}`));
      console.log(chalk.gray(`  Visualization: ${sampleWidget.visualization?.id}`));
      console.log(chalk.gray(`  Layout: Column ${sampleWidget.layout.column}, Row ${sampleWidget.layout.row}`));
      if (sampleWidget.rawConfiguration?.nrqlQueries?.[0]?.query) {
        console.log(chalk.gray(`  Query: ${sampleWidget.rawConfiguration.nrqlQueries[0].query}`));
      }
    }
    
    // Save results
    const outputPath = path.join(__dirname, `catalog-test-results-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify({
      analysis,
      catalogPage,
      summary: {
        totalCategories: Object.keys(analysis.categories).length,
        totalMetrics: Object.values(analysis.categories).reduce((sum, arr) => sum + arr.length, 0),
        totalWidgets: catalogPage.widgets.length,
        widgetTypes
      }
    }, null, 2));
    
    console.log(chalk.gray(`\n💾 Results saved to: ${outputPath}`));
    
    console.log(chalk.bold.cyan('\n✨ Test completed successfully!\n'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Error:'), error.message);
    console.error(chalk.gray('\nStack trace:'), error.stack);
    process.exit(1);
  }
}

// Run the test
testCatalogGeneration().catch(console.error);