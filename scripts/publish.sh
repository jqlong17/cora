#!/bin/bash

# 加载 .env 文件
if [ -f .env ]; then
  export $(cat .env | xargs)
fi

# 检查 Token 是否存在
if [ -z "$VSCE_PAT" ] || [ -z "$OVSX_PAT" ]; then
  echo "❌ Error: VSCE_PAT or OVSX_PAT not found in .env"
  exit 1
fi

echo "🚀 Starting publication process..."

# 1. 发布到 VS Code Marketplace
echo "--------------------------------------------------"
echo "📦 Publishing to VS Code Marketplace..."
vsce publish -p "$VSCE_PAT"
if [ $? -eq 0 ]; then
  echo "✅ VS Code Marketplace: Success"
else
  echo "❌ VS Code Marketplace: Failed"
  exit 1
fi

# 2. 发布到 Open VSX Registry
echo "--------------------------------------------------"
echo "📦 Publishing to Open VSX Registry..."
npx ovsx publish -p "$OVSX_PAT"
if [ $? -eq 0 ]; then
  echo "✅ Open VSX Registry: Success"
else
  echo "❌ Open VSX Registry: Failed"
  exit 1
fi

echo "--------------------------------------------------"
echo "🎉 All published successfully!"
