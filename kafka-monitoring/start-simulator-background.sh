#!/bin/bash

# Background Kafka Simulator Manager
# This script ensures the simulator keeps running in the background

LOGFILE="/tmp/kafka-simulator-monitor.log"
PIDFILE="/tmp/kafka-simulator-monitor.pid"

# Function to check if monitor is already running
is_running() {
    if [ -f "$PIDFILE" ]; then
        PID=$(cat "$PIDFILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

# Function to start the monitor
start_monitor() {
    if is_running; then
        echo "❌ Simulator monitor is already running (PID: $(cat $PIDFILE))"
        return 1
    fi
    
    echo "🚀 Starting Kafka Simulator Monitor in background..."
    echo "📝 Logs will be written to: $LOGFILE"
    
    # Start monitor in background
    nohup bash -c '
        while true; do
            # Check if kubectl is available
            if ! command -v kubectl &> /dev/null; then
                echo "[$(date)] kubectl not found, waiting..." >> "'$LOGFILE'"
                sleep 60
                continue
            fi
            
            # Check if cluster is accessible
            if ! kubectl cluster-info &> /dev/null; then
                echo "[$(date)] Kubernetes cluster not accessible, waiting..." >> "'$LOGFILE'"
                sleep 60
                continue
            fi
            
            # Check simulator status
            READY=$(kubectl get deployment kafka-comprehensive-simulator -n kafka-monitoring -o jsonpath="{.status.readyReplicas}" 2>/dev/null)
            
            if [ "$READY" != "1" ]; then
                echo "[$(date)] Simulator not ready, attempting restart..." >> "'$LOGFILE'"
                kubectl scale deployment/kafka-comprehensive-simulator -n kafka-monitoring --replicas=0
                sleep 5
                kubectl scale deployment/kafka-comprehensive-simulator -n kafka-monitoring --replicas=1
                sleep 30
            else
                echo "[$(date)] ✅ Simulator is running" >> "'$LOGFILE'"
            fi
            
            sleep 60
        done
    ' > "$LOGFILE" 2>&1 &
    
    # Save PID
    echo $! > "$PIDFILE"
    echo "✅ Monitor started with PID: $!"
    echo "📋 To check status: tail -f $LOGFILE"
    echo "🛑 To stop: $0 stop"
}

# Function to stop the monitor
stop_monitor() {
    if ! is_running; then
        echo "❌ Simulator monitor is not running"
        return 1
    fi
    
    PID=$(cat "$PIDFILE")
    echo "🛑 Stopping Kafka Simulator Monitor (PID: $PID)..."
    kill "$PID"
    rm -f "$PIDFILE"
    echo "✅ Monitor stopped"
}

# Function to check status
check_status() {
    if is_running; then
        PID=$(cat "$PIDFILE")
        echo "✅ Simulator monitor is running (PID: $PID)"
        echo "📊 Recent logs:"
        tail -5 "$LOGFILE"
    else
        echo "❌ Simulator monitor is not running"
    fi
}

# Main script logic
case "$1" in
    start)
        start_monitor
        ;;
    stop)
        stop_monitor
        ;;
    status)
        check_status
        ;;
    restart)
        stop_monitor
        sleep 2
        start_monitor
        ;;
    logs)
        tail -f "$LOGFILE"
        ;;
    *)
        echo "Usage: $0 {start|stop|status|restart|logs}"
        echo ""
        echo "Commands:"
        echo "  start   - Start the simulator monitor in background"
        echo "  stop    - Stop the simulator monitor"
        echo "  status  - Check if monitor is running"
        echo "  restart - Restart the monitor"
        echo "  logs    - Follow the monitor logs"
        exit 1
        ;;
esac