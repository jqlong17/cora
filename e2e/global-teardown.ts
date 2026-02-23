import * as fs from 'fs';
import * as path from 'path';

/**
 * 全局清理：测试结束后清理
 */
async function globalTeardown() {
  console.log('Cleaning up after E2E tests...');

  // 清理测试工作区（可选）
  const testWorkspace = process.env.TEST_WORKSPACE;
  if (testWorkspace && fs.existsSync(testWorkspace)) {
    // 保留测试文件以便调试
    // fs.rmSync(testWorkspace, { recursive: true, force: true });
    console.log('Test workspace preserved at:', testWorkspace);
  }

  console.log('Global teardown completed');
}

export default globalTeardown;
