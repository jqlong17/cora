#!/bin/bash

# Cora E2E 测试运行脚本
# 使用方法: ./run-e2e-tests.sh [test-type]
#   test-type: integration | playwright | all (默认: integration)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_TYPE="${1:-integration}"

echo "========================================="
echo "Cora E2E Test Runner"
echo "Test Type: $TEST_TYPE"
echo "========================================="

cd "$PROJECT_ROOT"

case "$TEST_TYPE" in
  integration)
    echo "Running Integration Tests..."
    echo ""
    echo "This will:"
    echo "1. Compile the extension"
    echo "2. Launch VS Code Extension Test Host"
    echo "3. Run all tests in src/test/suite/"
    echo ""

    # 确保依赖已安装
    if [ ! -d "node_modules" ]; then
      echo "Installing dependencies..."
      npm install
    fi

    # 运行测试
    npm test
    ;;

  playwright)
    echo "Running Playwright E2E Tests..."
    echo ""
    echo "This will:"
    echo "1. Install Playwright dependencies"
    echo "2. Launch VS Code"
    echo "3. Run UI automation tests"
    echo ""

    cd "$PROJECT_ROOT/e2e"

    # 安装依赖
    if [ ! -d "node_modules" ]; then
      echo "Installing Playwright dependencies..."
      npm install
      npx playwright install
    fi

    # 运行测试
    npm test
    ;;

  all)
    echo "Running All Tests..."
    ./run-e2e-tests.sh integration
    ./run-e2e-tests.sh playwright
    ;;

  *)
    echo "Unknown test type: $TEST_TYPE"
    echo "Usage: $0 [integration|playwright|all]"
    exit 1
    ;;
esac

echo ""
echo "========================================="
echo "Test run completed!"
echo "========================================="
