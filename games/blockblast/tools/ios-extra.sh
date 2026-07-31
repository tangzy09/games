#!/bin/bash
# blockblast 专属 iOS 附加配置（codemagic 在 `cap add ios && cap sync` 之后调用）。
# Game Center：bundleId 的 GAME_CENTER 能力已由 ASC API 开好；这里给 Xcode 工程补
# entitlements 文件并挂进构建配置（Capacitor 生成的工程默认没有 CODE_SIGN_ENTITLEMENTS）。
set -e

ENT=ios/App/App/App.entitlements
cat > "$ENT" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.developer.game-center</key>
	<true/>
</dict>
</plist>
EOF
echo "已写 $ENT"

# 把 entitlements 挂进 App target 的 Debug/Release 两个构建配置
PBX=ios/App/App.xcodeproj/project.pbxproj
if grep -q CODE_SIGN_ENTITLEMENTS "$PBX"; then
  echo "pbxproj 已有 CODE_SIGN_ENTITLEMENTS，跳过"
else
  perl -i -pe 's/(PRODUCT_BUNDLE_IDENTIFIER = com\.aispeeds\.cubeblast;)/$1\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = "App\/App.entitlements";/g' "$PBX"
fi
# 验收：必须恰好挂上 2 处（Debug + Release），否则出包会静默丢 Game Center
N=$(grep -c CODE_SIGN_ENTITLEMENTS "$PBX")
echo "CODE_SIGN_ENTITLEMENTS 出现 $N 处"
[ "$N" -eq 2 ] || { echo "✗ 期望 2 处（Debug+Release）"; exit 1; }
