/**
 * Intelligent Dashboard Builder
 * Creates optimal dashboards based on discovered metrics using advanced logic
 */

const { logger } = require('./logger');
const { NerdGraphClient } = require('../../src/core/api-client');

class IntelligentDashboardBuilder {
  constructor(config = {}) {
    this.config = {
      accountId: config.accountId || process.env.NEW_RELIC_ACCOUNT_ID,
      apiKey: config.apiKey || process.env.NEW_RELIC_API_KEY,
      maxWidgetsPerPage: config.maxWidgetsPerPage || 12,
      enableAnomalyDetection: config.enableAnomalyDetection !== false,
      enableCorrelations: config.enableCorrelations !== false,
      enablePredictions: config.enablePredictions !== false,
      ...config
    };
    
    this.client = new NerdGraphClient({
      apiKey: this.config.apiKey,
      region: config.region || 'US'
    });
    
    // Metric patterns for intelligent categorization
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
    
    // Visualization selection matrix
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

  /**
   * Build intelligent dashboards from discovery results
   */
  async buildDashboards(discoveryResults) {
    logger.info('Starting intelligent dashboard generation');
    
    try {
      // Step 1: Analyze and categorize metrics
      const analysis = await this.analyzeMetrics(discoveryResults);
      
      // Step 2: Detect correlations between metrics
      const correlations = this.config.enableCorrelations ? 
        await this.detectCorrelations(analysis) : {};
      
      // Step 3: Generate dashboard structure
      const dashboardPlan = this.generateDashboardPlan(analysis, correlations);
      
      // Step 4: Create optimized widgets
      const widgets = await this.createOptimizedWidgets(dashboardPlan, analysis);
      
      // Step 5: Build final dashboard configuration
      const dashboardConfig = this.buildDashboardConfig(widgets, analysis);
      
      // Step 6: Deploy dashboard
      const dashboard = await this.deployDashboard(dashboardConfig);
      
      return {
        dashboard,
        analysis,
        correlations,
        insights: this.generateInsights(analysis, correlations)
      };
      
    } catch (error) {
      logger.error('Error building intelligent dashboard:', error);
      throw error;
    }
  }

  /**
   * Analyze metrics and categorize them intelligently
   */
  async analyzeMetrics(discoveryResults) {
    logger.info('Analyzing metrics for intelligent categorization');
    
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
        const eventAnalysis = await this.analyzeEventType(eventType);
        analysis.eventTypes[eventType.name] = eventAnalysis;
        
        // Categorize metrics within event type
        for (const attribute of eventAnalysis.attributes) {
          const category = this.categorizeMetric(attribute.name);
          if (!analysis.categories[category]) {
            analysis.categories[category] = [];
          }
          analysis.categories[category].push({
            eventType: eventType.name,
            attribute: attribute.name,
            type: attribute.type,
            cardinality: attribute.cardinality
          });
          
          // Map to golden signals
          this.mapToGoldenSignals(attribute, eventType.name, analysis.goldenSignals);
        }
      }
    }
    
    // Analyze standalone metrics
    if (discoveryResults.metrics) {
      for (const metric of discoveryResults.metrics) {
        const metricAnalysis = this.analyzeMetric(metric);
        analysis.metrics[metric.name] = metricAnalysis;
        
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
    
    // Identify time series candidates
    analysis.timeSeries = this.identifyTimeSeriesMetrics(analysis);
    
    // Identify aggregation candidates  
    analysis.aggregations = this.identifyAggregationMetrics(analysis);
    
    // Identify dimension candidates
    analysis.dimensions = this.identifyDimensions(analysis);
    
    return analysis;
  }

  /**
   * Analyze a single event type
   */
  async analyzeEventType(eventType) {
    const sampleQuery = `
      SELECT * FROM ${eventType.name} 
      LIMIT 1 
      SINCE 1 hour ago
    `;
    
    try {
      const sample = await this.client.nrql(this.config.accountId, sampleQuery);
      const attributes = [];
      
      if (sample?.results?.[0]) {
        for (const [key, value] of Object.entries(sample.results[0])) {
          if (key !== 'timestamp' && key !== 'eventType') {
            attributes.push({
              name: key,
              type: typeof value,
              sampleValue: value,
              cardinality: await this.estimateCardinality(eventType.name, key)
            });
          }
        }
      }
      
      return {
        name: eventType.name,
        attributes,
        volume: eventType.count,
        timeRange: eventType.timeRange
      };
      
    } catch (error) {
      logger.warn(`Failed to analyze event type ${eventType.name}:`, error.message);
      return {
        name: eventType.name,
        attributes: [],
        volume: eventType.count,
        error: error.message
      };
    }
  }

  /**
   * Estimate cardinality of an attribute
   */
  async estimateCardinality(eventType, attribute) {
    const query = `
      SELECT uniqueCount(${attribute}) 
      FROM ${eventType} 
      SINCE 1 hour ago
    `;
    
    try {
      const result = await this.client.nrql(this.config.accountId, query);
      return result?.results?.[0]?.['uniqueCount'] || 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Categorize a metric based on its name and characteristics
   */
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

  /**
   * Map metrics to golden signals (latency, traffic, errors, saturation)
   */
  mapToGoldenSignals(attribute, eventType, goldenSignals) {
    const name = attribute.name.toLowerCase();
    const fullName = `${eventType}.${attribute.name}`;
    
    // Latency
    if (this.metricPatterns.latency.test(name) && attribute.type === 'number') {
      goldenSignals.latency.push(fullName);
    }
    
    // Traffic
    if (this.metricPatterns.throughput.test(name) || 
        name.includes('request') || name.includes('message')) {
      goldenSignals.traffic.push(fullName);
    }
    
    // Errors
    if (this.metricPatterns.error.test(name)) {
      goldenSignals.errors.push(fullName);
    }
    
    // Saturation
    if (this.metricPatterns.utilization.test(name) || 
        name.includes('queue') || name.includes('pending')) {
      goldenSignals.saturation.push(fullName);
    }
  }

  /**
   * Detect correlations between metrics
   */
  async detectCorrelations(analysis) {
    logger.info('Detecting metric correlations');
    
    const correlations = {
      strong: [],
      moderate: [],
      inverse: []
    };
    
    // Find metrics that typically correlate
    const correlationPatterns = [
      { pattern1: /request.*rate/i, pattern2: /error.*rate/i, type: 'error_rate' },
      { pattern1: /cpu.*percent/i, pattern2: /memory.*percent/i, type: 'resource' },
      { pattern1: /throughput/i, pattern2: /latency/i, type: 'performance' },
      { pattern1: /queue.*size/i, pattern2: /processing.*time/i, type: 'queueing' },
      { pattern1: /connection/i, pattern2: /thread/i, type: 'concurrency' }
    ];
    
    for (const category of Object.values(analysis.categories)) {
      for (const metric1 of category) {
        for (const metric2 of category) {
          if (metric1 !== metric2) {
            for (const pattern of correlationPatterns) {
              const name1 = metric1.attribute || metric1.metricName;
              const name2 = metric2.attribute || metric2.metricName;
              
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

  /**
   * Generate dashboard plan based on analysis
   */
  generateDashboardPlan(analysis, correlations) {
    logger.info('Generating optimal dashboard plan');
    
    const plan = {
      pages: [],
      globalFilters: [],
      layout: 'auto'
    };
    
    // Page 1: Overview with golden signals
    if (Object.values(analysis.goldenSignals).some(arr => arr.length > 0)) {
      plan.pages.push({
        name: 'Golden Signals Overview',
        description: 'Key performance indicators based on Google SRE golden signals',
        sections: [
          { type: 'latency', metrics: analysis.goldenSignals.latency },
          { type: 'traffic', metrics: analysis.goldenSignals.traffic },
          { type: 'errors', metrics: analysis.goldenSignals.errors },
          { type: 'saturation', metrics: analysis.goldenSignals.saturation }
        ]
      });
    }
    
    // Page 2: Category-based pages
    for (const [category, metrics] of Object.entries(analysis.categories)) {
      if (metrics.length > 0) {
        plan.pages.push({
          name: this.formatCategoryName(category),
          description: `Metrics related to ${category}`,
          sections: this.organizeCategoryMetrics(category, metrics, correlations)
        });
      }
    }
    
    // Page 3: Anomaly detection (if enabled)
    if (this.config.enableAnomalyDetection) {
      plan.pages.push({
        name: 'Anomaly Detection',
        description: 'Automatic anomaly detection for key metrics',
        sections: [
          { type: 'anomaly', metrics: this.selectAnomalyMetrics(analysis) }
        ]
      });
    }
    
    // Page 4: Correlations (if found)
    if (correlations.strong.length > 0) {
      plan.pages.push({
        name: 'Metric Correlations',
        description: 'Correlated metrics for root cause analysis',
        sections: [
          { type: 'correlation', correlations: correlations.strong }
        ]
      });
    }
    
    return plan;
  }

  /**
   * Create optimized widgets based on dashboard plan
   */
  async createOptimizedWidgets(plan, analysis) {
    logger.info('Creating optimized dashboard widgets');
    
    const allWidgets = [];
    
    for (const page of plan.pages) {
      const pageWidgets = [];
      let row = 1;
      
      for (const section of page.sections) {
        const sectionWidgets = await this.createSectionWidgets(
          section, 
          analysis, 
          { startRow: row }
        );
        
        pageWidgets.push(...sectionWidgets);
        
        // Calculate next row position
        const maxRow = Math.max(...sectionWidgets.map(w => w.layout.row + w.layout.height));
        row = maxRow;
      }
      
      allWidgets.push({
        pageName: page.name,
        pageDescription: page.description,
        widgets: this.optimizeLayout(pageWidgets)
      });
    }
    
    return allWidgets;
  }

  /**
   * Create widgets for a dashboard section
   */
  async createSectionWidgets(section, analysis, options = {}) {
    const widgets = [];
    const { startRow = 1 } = options;
    
    switch (section.type) {
      case 'latency':
        widgets.push(...this.createLatencyWidgets(section.metrics, startRow));
        break;
        
      case 'traffic':
        widgets.push(...this.createTrafficWidgets(section.metrics, startRow));
        break;
        
      case 'errors':
        widgets.push(...this.createErrorWidgets(section.metrics, startRow));
        break;
        
      case 'saturation':
        widgets.push(...this.createSaturationWidgets(section.metrics, startRow));
        break;
        
      case 'anomaly':
        widgets.push(...this.createAnomalyWidgets(section.metrics, startRow));
        break;
        
      case 'correlation':
        widgets.push(...this.createCorrelationWidgets(section.correlations, startRow));
        break;
        
      default:
        widgets.push(...this.createGenericWidgets(section, analysis, startRow));
    }
    
    return widgets;
  }

  /**
   * Create latency-specific widgets
   */
  createLatencyWidgets(metrics, startRow) {
    const widgets = [];
    
    if (metrics.length === 0) return widgets;
    
    // P95 latency trend
    widgets.push({
      title: 'Latency Trends (P95)',
      configuration: {
        line: {
          nrql_queries: [{
            query: `SELECT percentile(${metrics[0].split('.')[1]}, 95) FROM ${metrics[0].split('.')[0]} TIMESERIES AUTO`,
            accountId: parseInt(this.config.accountId)
          }]
        }
      },
      layout: { column: 1, row: startRow, width: 6, height: 3 }
    });
    
    // Latency heatmap
    widgets.push({
      title: 'Latency Distribution',
      configuration: {
        heatmap: {
          nrql_queries: [{
            query: `SELECT histogram(${metrics[0].split('.')[1]}, 20, 10) FROM ${metrics[0].split('.')[0]} FACET appName`,
            accountId: parseInt(this.config.accountId)
          }]
        }
      },
      layout: { column: 7, row: startRow, width: 6, height: 3 }
    });
    
    return widgets;
  }

  /**
   * Create traffic-specific widgets
   */
  createTrafficWidgets(metrics, startRow) {
    const widgets = [];
    
    if (metrics.length === 0) return widgets;
    
    // Traffic volume
    widgets.push({
      title: 'Traffic Volume',
      configuration: {
        area: {
          nrql_queries: [{
            query: `SELECT rate(sum(${metrics[0].split('.')[1]}), 1 minute) FROM ${metrics[0].split('.')[0]} TIMESERIES AUTO`,
            accountId: parseInt(this.config.accountId)
          }]
        }
      },
      layout: { column: 1, row: startRow, width: 8, height: 3 }
    });
    
    // Traffic by source
    if (metrics.length > 1) {
      widgets.push({
        title: 'Traffic Distribution',
        configuration: {
          pie: {
            nrql_queries: [{
              query: `SELECT sum(${metrics[0].split('.')[1]}) FROM ${metrics[0].split('.')[0]} FACET appName SINCE 1 hour ago`,
              accountId: parseInt(this.config.accountId)
            }]
          }
        },
        layout: { column: 9, row: startRow, width: 4, height: 3 }
      });
    }
    
    return widgets;
  }

  /**
   * Create error-specific widgets
   */
  createErrorWidgets(metrics, startRow) {
    const widgets = [];
    
    if (metrics.length === 0) return widgets;
    
    // Error rate
    widgets.push({
      title: 'Error Rate',
      configuration: {
        line: {
          nrql_queries: [{
            query: `SELECT percentage(count(*), WHERE ${metrics[0].split('.')[1]} > 0) FROM ${metrics[0].split('.')[0]} TIMESERIES AUTO`,
            accountId: parseInt(this.config.accountId)
          }]
        }
      },
      layout: { column: 1, row: startRow, width: 6, height: 3 }
    });
    
    // Error types
    widgets.push({
      title: 'Error Types',
      configuration: {
        bar: {
          nrql_queries: [{
            query: `SELECT count(*) FROM ${metrics[0].split('.')[0]} WHERE ${metrics[0].split('.')[1]} > 0 FACET error.class SINCE 1 hour ago`,
            accountId: parseInt(this.config.accountId)
          }]
        }
      },
      layout: { column: 7, row: startRow, width: 6, height: 3 }
    });
    
    return widgets;
  }

  /**
   * Create saturation widgets
   */
  createSaturationWidgets(metrics, startRow) {
    const widgets = [];
    
    if (metrics.length === 0) return widgets;
    
    // Resource utilization gauge
    widgets.push({
      title: 'Resource Saturation',
      configuration: {
        billboard: {
          nrql_queries: metrics.slice(0, 4).map(metric => ({
            query: `SELECT latest(${metric.split('.')[1]}) FROM ${metric.split('.')[0]}`,
            accountId: parseInt(this.config.accountId)
          }))
        }
      },
      layout: { column: 1, row: startRow, width: 12, height: 2 }
    });
    
    return widgets;
  }

  /**
   * Create anomaly detection widgets
   */
  createAnomalyWidgets(metrics, startRow) {
    const widgets = [];
    
    // Anomaly detection using baseline comparison
    widgets.push({
      title: 'Anomaly Detection - Key Metrics',
      configuration: {
        line: {
          nrql_queries: [{
            query: `SELECT average(cpuPercent) as 'Current', average(cpuPercent) as 'Baseline' FROM SystemSample TIMESERIES AUTO COMPARE WITH 1 week ago`,
            accountId: parseInt(this.config.accountId)
          }]
        }
      },
      layout: { column: 1, row: startRow, width: 12, height: 3 }
    });
    
    return widgets;
  }

  /**
   * Create correlation widgets
   */
  createCorrelationWidgets(correlations, startRow) {
    const widgets = [];
    
    for (let i = 0; i < Math.min(correlations.length, 4); i++) {
      const correlation = correlations[i];
      widgets.push({
        title: `Correlation: ${correlation.type}`,
        configuration: {
          line: {
            nrql_queries: [
              {
                query: `SELECT average(${correlation.metric1}) as '${correlation.metric1}' FROM Transaction TIMESERIES AUTO`,
                accountId: parseInt(this.config.accountId)
              },
              {
                query: `SELECT average(${correlation.metric2}) as '${correlation.metric2}' FROM Transaction TIMESERIES AUTO`,
                accountId: parseInt(this.config.accountId)
              }
            ]
          }
        },
        layout: { column: (i % 2) * 6 + 1, row: startRow + Math.floor(i / 2) * 3, width: 6, height: 3 }
      });
    }
    
    return widgets;
  }

  /**
   * Create generic widgets for uncategorized metrics
   */
  createGenericWidgets(section, analysis, startRow) {
    const widgets = [];
    
    // Implement generic widget creation
    // This would analyze the metric type and create appropriate visualizations
    
    return widgets;
  }

  /**
   * Optimize widget layout for better visual presentation
   */
  optimizeLayout(widgets) {
    // Sort widgets by importance and size
    const optimized = [...widgets];
    
    // Ensure no overlapping widgets
    for (let i = 0; i < optimized.length; i++) {
      for (let j = i + 1; j < optimized.length; j++) {
        if (this.widgetsOverlap(optimized[i], optimized[j])) {
          // Adjust position
          optimized[j].layout.row = optimized[i].layout.row + optimized[i].layout.height;
        }
      }
    }
    
    return optimized;
  }

  /**
   * Check if two widgets overlap
   */
  widgetsOverlap(widget1, widget2) {
    const w1 = widget1.layout;
    const w2 = widget2.layout;
    
    return !(w1.column + w1.width <= w2.column || 
             w2.column + w2.width <= w1.column ||
             w1.row + w1.height <= w2.row || 
             w2.row + w2.height <= w1.row);
  }

  /**
   * Build final dashboard configuration
   */
  buildDashboardConfig(widgetPages, analysis) {
    const timestamp = new Date().toISOString().split('T')[0];
    
    // Add comprehensive metrics catalog page
    const catalogPage = this.buildMetricsCatalogPage(analysis);
    
    const allPages = widgetPages.map(page => ({
      name: page.pageName,
      description: page.pageDescription,
      widgets: page.widgets
    }));
    
    // Add catalog page at the end
    allPages.push(catalogPage);
    
    return {
      name: `Intelligent Dashboard - ${timestamp}`,
      description: `Auto-generated dashboard based on discovered metrics. Includes ${Object.keys(analysis.eventTypes).length} event types and ${Object.keys(analysis.metrics).length} metrics.`,
      permissions: 'PUBLIC_READ_WRITE',
      pages: allPages
    };
  }
  
  /**
   * Build comprehensive metrics catalog page
   */
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
  
  /**
   * Generate catalog overview text
   */
  generateCatalogOverview(analysis) {
    const totalMetrics = Object.values(analysis.categories).reduce((sum, arr) => sum + arr.length, 0);
    const eventTypeCount = Object.keys(analysis.eventTypes).length;
    const categoryCount = Object.keys(analysis.categories).length;
    
    let text = `# Complete Metrics Catalog

**Discovery Summary**
- Total Metrics: ${totalMetrics}
- Event Types: ${eventTypeCount}
- Categories: ${categoryCount}
- Time Series Metrics: ${analysis.timeSeries.length}

**Intelligent Categorization Applied**
`;
    
    // Add category summary
    for (const [category, metrics] of Object.entries(analysis.categories)) {
      if (metrics.length > 0) {
        text += `- **${this.formatCategoryName(category)}**: ${metrics.length} metrics\n`;
      }
    }
    
    text += `\n**Visualization Types**: Each category uses optimal chart types based on metric characteristics.`;
    
    return text;
  }
  
  /**
   * Create widgets for a metric category
   */
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
  
  /**
   * Create dynamic widget based on metrics
   */
  createDynamicWidget(category, eventType, metrics, vizType, position) {
    // Skip if no metrics
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
  
  /**
   * Build dynamic NRQL query based on metrics
   */
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
  
  /**
   * Create comprehensive metrics table
   */
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
  
  /**
   * Build query for metrics summary table
   */
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
  
  /**
   * Helper methods for catalog generation
   */
  
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

  /**
   * Deploy dashboard to New Relic
   */
  async deployDashboard(dashboardConfig) {
    logger.info('Deploying intelligent dashboard');
    
    try {
      const result = await this.client.createDashboard(
        this.config.accountId, 
        dashboardConfig
      );
      
      logger.info('Dashboard deployed successfully:', result.guid);
      
      return {
        ...result,
        url: `https://one.newrelic.com/dashboards/${result.guid}`
      };
      
    } catch (error) {
      logger.error('Failed to deploy dashboard:', error);
      throw error;
    }
  }

  /**
   * Generate insights from analysis
   */
  generateInsights(analysis, correlations) {
    const insights = [];
    
    // Golden signals insights
    if (analysis.goldenSignals.errors.length > 0 && analysis.goldenSignals.traffic.length > 0) {
      insights.push({
        type: 'recommendation',
        severity: 'high',
        message: 'Consider creating error rate alerts based on traffic volume',
        metrics: [...analysis.goldenSignals.errors, ...analysis.goldenSignals.traffic]
      });
    }
    
    // Correlation insights
    if (correlations.strong.length > 0) {
      insights.push({
        type: 'correlation',
        severity: 'medium',
        message: `Found ${correlations.strong.length} strong metric correlations that can help with root cause analysis`,
        correlations: correlations.strong
      });
    }
    
    // Missing metrics insights
    const missingGoldenSignals = [];
    for (const [signal, metrics] of Object.entries(analysis.goldenSignals)) {
      if (metrics.length === 0) {
        missingGoldenSignals.push(signal);
      }
    }
    
    if (missingGoldenSignals.length > 0) {
      insights.push({
        type: 'gap',
        severity: 'medium',
        message: `Missing golden signals: ${missingGoldenSignals.join(', ')}. Consider adding instrumentation.`,
        missing: missingGoldenSignals
      });
    }
    
    return insights;
  }

  /**
   * Helper methods
   */
  
  formatCategoryName(category) {
    return category.charAt(0).toUpperCase() + category.slice(1) + ' Metrics';
  }
  
  organizeCategoryMetrics(category, metrics, correlations) {
    // Organize metrics within a category into logical sections
    const sections = [];
    
    // Group by event type
    const byEventType = {};
    for (const metric of metrics) {
      const eventType = metric.eventType || 'Metrics';
      if (!byEventType[eventType]) {
        byEventType[eventType] = [];
      }
      byEventType[eventType].push(metric);
    }
    
    for (const [eventType, eventMetrics] of Object.entries(byEventType)) {
      sections.push({
        type: 'metrics',
        eventType,
        category,
        metrics: eventMetrics
      });
    }
    
    return sections;
  }
  
  selectAnomalyMetrics(analysis) {
    // Select top metrics for anomaly detection
    const candidates = [];
    
    // Prioritize golden signals
    for (const signals of Object.values(analysis.goldenSignals)) {
      candidates.push(...signals.slice(0, 2));
    }
    
    // Add high-cardinality metrics
    for (const eventAnalysis of Object.values(analysis.eventTypes)) {
      for (const attr of eventAnalysis.attributes) {
        if (attr.type === 'number' && attr.cardinality === 'unknown') {
          candidates.push(`${eventAnalysis.name}.${attr.name}`);
        }
      }
    }
    
    return candidates.slice(0, 10);
  }
  
  identifyTimeSeriesMetrics(analysis) {
    const timeSeries = [];
    
    for (const eventAnalysis of Object.values(analysis.eventTypes)) {
      for (const attr of eventAnalysis.attributes) {
        if (attr.type === 'number') {
          timeSeries.push({
            metric: `${eventAnalysis.name}.${attr.name}`,
            aggregations: ['average', 'min', 'max', 'sum', 'count']
          });
        }
      }
    }
    
    return timeSeries;
  }
  
  identifyAggregationMetrics(analysis) {
    const aggregations = [];
    
    for (const [category, metrics] of Object.entries(analysis.categories)) {
      if (['count', 'bytes', 'throughput'].includes(category)) {
        aggregations.push(...metrics);
      }
    }
    
    return aggregations;
  }
  
  identifyDimensions(analysis) {
    const dimensions = [];
    
    for (const eventAnalysis of Object.values(analysis.eventTypes)) {
      for (const attr of eventAnalysis.attributes) {
        if (attr.type === 'string' && attr.cardinality < 100) {
          dimensions.push({
            eventType: eventAnalysis.name,
            attribute: attr.name,
            cardinality: attr.cardinality
          });
        }
      }
    }
    
    return dimensions;
  }
  
  analyzeMetric(metric) {
    return {
      name: metric.name,
      type: metric.type || 'gauge',
      unit: metric.unit || 'unknown',
      category: this.categorizeMetric(metric.name)
    };
  }
}

module.exports = IntelligentDashboardBuilder;