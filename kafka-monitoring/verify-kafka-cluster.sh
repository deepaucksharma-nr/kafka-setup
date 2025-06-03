#!/bin/bash

# Comprehensive Kafka Cluster Verification Script
# This script checks all aspects of the Kafka monitoring setup

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="kafka-monitoring"
TIMEOUT=10

# Results tracking
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNINGS=0

# Function to print headers
print_header() {
    echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
}

# Function to check command result
check_result() {
    local description="$1"
    local command="$2"
    local expected="$3"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    echo -n "Checking: $description... "
    
    result=$(eval "$command" 2>&1)
    exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        if [ -n "$expected" ]; then
            if [[ "$result" == *"$expected"* ]]; then
                echo -e "${GREEN}✓ PASSED${NC}"
                PASSED_CHECKS=$((PASSED_CHECKS + 1))
                return 0
            else
                echo -e "${RED}✗ FAILED${NC} (Expected: $expected, Got: $result)"
                FAILED_CHECKS=$((FAILED_CHECKS + 1))
                return 1
            fi
        else
            echo -e "${GREEN}✓ PASSED${NC}"
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
            return 0
        fi
    else
        echo -e "${RED}✗ FAILED${NC} (Error: $result)"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi
}

# Function to check numeric result
check_numeric() {
    local description="$1"
    local command="$2"
    local operator="$3"
    local expected="$4"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    echo -n "Checking: $description... "
    
    result=$(eval "$command" 2>&1)
    exit_code=$?
    
    if [ $exit_code -eq 0 ] && [[ "$result" =~ ^[0-9]+$ ]]; then
        if [ "$operator" = "-gt" ] && [ "$result" -gt "$expected" ]; then
            echo -e "${GREEN}✓ PASSED${NC} (Value: $result)"
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
            return 0
        elif [ "$operator" = "-eq" ] && [ "$result" -eq "$expected" ]; then
            echo -e "${GREEN}✓ PASSED${NC} (Value: $result)"
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
            return 0
        elif [ "$operator" = "-ge" ] && [ "$result" -ge "$expected" ]; then
            echo -e "${GREEN}✓ PASSED${NC} (Value: $result)"
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
            return 0
        else
            echo -e "${RED}✗ FAILED${NC} (Expected: $operator $expected, Got: $result)"
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
            return 1
        fi
    else
        echo -e "${RED}✗ FAILED${NC} (Error: $result)"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi
}

# Function to show detailed info
show_info() {
    local title="$1"
    local command="$2"
    
    echo -e "\n${YELLOW}$title:${NC}"
    eval "$command" 2>/dev/null || echo "Error executing command"
}

# Start verification
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       Kafka Monitoring Cluster Verification Suite         ║${NC}"
echo -e "${BLUE}║                 $(date '+%Y-%m-%d %H:%M:%S')                  ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"

# 1. Kubernetes Cluster Health
print_header "1. KUBERNETES CLUSTER HEALTH"

check_result "Kubernetes API accessible" \
    "kubectl cluster-info --request-timeout=${TIMEOUT}s | grep -q 'Kubernetes control plane'" \
    "Kubernetes control plane"

check_result "Nodes are ready" \
    "kubectl get nodes --no-headers | grep -v 'NotReady' | wc -l | xargs test 0 -lt" \
    ""

check_result "Namespace exists" \
    "kubectl get namespace $NAMESPACE --no-headers | grep -q 'Active'" \
    ""

# 2. Core Kafka Components
print_header "2. CORE KAFKA COMPONENTS"

check_result "Kafka broker pod running" \
    "kubectl get pod kafka-0 -n $NAMESPACE -o jsonpath='{.status.phase}'" \
    "Running"

check_result "Zookeeper pod running" \
    "kubectl get pod zookeeper-0 -n $NAMESPACE -o jsonpath='{.status.phase}'" \
    "Running"

check_result "Kafka broker ready" \
    "kubectl get pod kafka-0 -n $NAMESPACE -o jsonpath='{.status.conditions[?(@.type==\"Ready\")].status}'" \
    "True"

check_result "Zookeeper ready" \
    "kubectl get pod zookeeper-0 -n $NAMESPACE -o jsonpath='{.status.conditions[?(@.type==\"Ready\")].status}'" \
    "True"

# 3. Simulator Status
print_header "3. SIMULATOR STATUS"

check_result "Simulator deployment exists" \
    "kubectl get deployment kafka-comprehensive-simulator -n $NAMESPACE --no-headers | wc -l" \
    "1"

check_result "Simulator pod running" \
    "kubectl get pods -n $NAMESPACE -l app=kafka-comprehensive-simulator -o jsonpath='{.items[0].status.phase}'" \
    "Running"

check_result "Simulator process active" \
    "kubectl exec deployment/kafka-comprehensive-simulator -n $NAMESPACE -- ps aux | grep -c 'python3 /scripts/simulator.py' | grep -v grep" \
    ""

# 4. New Relic Integration
print_header "4. NEW RELIC INTEGRATION"

check_result "New Relic DaemonSet exists" \
    "kubectl get daemonset newrelic-infrastructure -n $NAMESPACE --no-headers | wc -l" \
    "1"

check_result "New Relic pods running" \
    "kubectl get pods -n $NAMESPACE -l app=newrelic-infrastructure -o jsonpath='{.items[*].status.phase}' | grep -o 'Running' | wc -l | xargs test 0 -lt" \
    ""

check_result "nri-kafka ConfigMap exists" \
    "kubectl get configmap newrelic-config -n $NAMESPACE --no-headers | wc -l" \
    "1"

# 5. Kafka Topics
print_header "5. KAFKA TOPICS"

check_numeric "Number of topics" \
    "kubectl exec kafka-0 -n $NAMESPACE -- bash -c 'export KAFKA_OPTS=\"\" && kafka-topics --list --bootstrap-server localhost:9092 2>/dev/null | wc -l'" \
    "-gt" \
    "20"

check_result "Standard topics exist" \
    "kubectl exec kafka-0 -n $NAMESPACE -- bash -c 'export KAFKA_OPTS=\"\" && kafka-topics --list --bootstrap-server localhost:9092 2>/dev/null | grep -E \"standard-p[0-9]+-topic\" | wc -l' | xargs test 0 -lt" \
    ""

check_result "Share group topics exist" \
    "kubectl exec kafka-0 -n $NAMESPACE -- bash -c 'export KAFKA_OPTS=\"\" && kafka-topics --list --bootstrap-server localhost:9092 2>/dev/null | grep -E \"share-group-workqueue\" | wc -l' | xargs test 0 -lt" \
    ""

# 6. Consumer Groups
print_header "6. CONSUMER GROUPS"

check_numeric "Number of consumer groups" \
    "kubectl exec kafka-0 -n $NAMESPACE -- bash -c 'export KAFKA_OPTS=\"\" && kafka-consumer-groups --list --bootstrap-server localhost:9092 2>/dev/null | wc -l'" \
    "-ge" \
    "4"

# 7. Message Flow
print_header "7. MESSAGE FLOW VERIFICATION"

# Check if messages are being produced
TOPIC="standard-p5-topic"
echo -n "Checking: Message production on $TOPIC... "
OFFSET1=$(kubectl exec kafka-0 -n $NAMESPACE -- bash -c "export KAFKA_OPTS='' && kafka-run-class kafka.tools.GetOffsetShell --broker-list localhost:9092 --topic $TOPIC 2>/dev/null | awk -F: '{sum += \$3} END {print sum+0}'" 2>/dev/null)
sleep 5
OFFSET2=$(kubectl exec kafka-0 -n $NAMESPACE -- bash -c "export KAFKA_OPTS='' && kafka-run-class kafka.tools.GetOffsetShell --broker-list localhost:9092 --topic $TOPIC 2>/dev/null | awk -F: '{sum += \$3} END {print sum+0}'" 2>/dev/null)

if [ -n "$OFFSET2" ] && [ "$OFFSET2" -gt "$OFFSET1" ]; then
    echo -e "${GREEN}✓ PASSED${NC} (Messages produced: $((OFFSET2-OFFSET1)) in 5 seconds)"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    echo -e "${YELLOW}⚠ WARNING${NC} (No new messages in 5 seconds)"
    WARNINGS=$((WARNINGS + 1))
fi
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

# 8. Resource Usage
print_header "8. RESOURCE USAGE"

show_info "Pod Resource Usage" \
    "kubectl top pods -n $NAMESPACE 2>/dev/null | head -10 || echo 'Metrics server not available'"

# 9. Network Connectivity
print_header "9. NETWORK CONNECTIVITY"

check_result "Kafka broker accessible from pods" \
    "kubectl run test-connection --image=busybox --rm -it --restart=Never -n $NAMESPACE -- timeout 5 nc -zv kafka-0.kafka 9092 2>&1 | grep -q 'open'" \
    "open"

check_result "Zookeeper accessible from pods" \
    "kubectl run test-zk-connection --image=busybox --rm -it --restart=Never -n $NAMESPACE -- timeout 5 nc -zv zookeeper 2181 2>&1 | grep -q 'open'" \
    "open"

# 10. Detailed Status Reports
print_header "10. DETAILED STATUS INFORMATION"

show_info "All Pods Status" \
    "kubectl get pods -n $NAMESPACE -o wide"

show_info "Recent Events" \
    "kubectl get events -n $NAMESPACE --sort-by='.lastTimestamp' | tail -10"

show_info "Consumer Group Lag" \
    "kubectl exec kafka-0 -n $NAMESPACE -- bash -c 'export KAFKA_OPTS=\"\" && kafka-consumer-groups --bootstrap-server localhost:9092 --all-groups --describe 2>/dev/null | grep -E \"GROUP|LAG\" | head -20'"

# Summary Report
print_header "VERIFICATION SUMMARY"

echo -e "Total Checks:    $TOTAL_CHECKS"
echo -e "Passed:          ${GREEN}$PASSED_CHECKS${NC}"
echo -e "Failed:          ${RED}$FAILED_CHECKS${NC}"
echo -e "Warnings:        ${YELLOW}$WARNINGS${NC}"
echo ""

SUCCESS_RATE=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))

if [ $SUCCESS_RATE -ge 90 ]; then
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║        CLUSTER STATUS: HEALTHY ($SUCCESS_RATE% Success)          ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
elif [ $SUCCESS_RATE -ge 70 ]; then
    echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║      CLUSTER STATUS: DEGRADED ($SUCCESS_RATE% Success)          ║${NC}"
    echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════╝${NC}"
else
    echo -e "${RED}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║       CLUSTER STATUS: CRITICAL ($SUCCESS_RATE% Success)         ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════╝${NC}"
fi

# Quick fix suggestions
if [ $FAILED_CHECKS -gt 0 ]; then
    echo -e "\n${YELLOW}Quick Fix Suggestions:${NC}"
    
    if ! kubectl cluster-info &>/dev/null; then
        echo "- Start Docker Desktop and wait for Kubernetes to be ready"
    fi
    
    if ! kubectl get pod kafka-0 -n $NAMESPACE &>/dev/null; then
        echo "- Deploy Kafka: kubectl apply -f kafka-deployment.yaml"
    fi
    
    if ! kubectl get deployment kafka-comprehensive-simulator -n $NAMESPACE &>/dev/null; then
        echo "- Deploy simulator: kubectl apply -f kafka-comprehensive-simulator-optimized.yaml"
    fi
fi

exit $FAILED_CHECKS