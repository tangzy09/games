# ASC 三份问卷的答案（2048 Shooter: Fish Merge）

> 依据本 app 的**真实事实**：无内购（只有广告）· 无账号/无自有服务器 · 存档只在本机 ·
> 通过 **AdMob** 展示广告并使用 **IDFA**（会弹 ATT）· `Info.plist` 已注入 SKAdNetwork 清单与
> `ITSAppUsesNonExemptEncryption=false`。

---

## ① 年龄分级问卷（App Information → Age Rating）

**内容类问题——除下面注明的，其余全部选「无 / None」：**

| 题目 | 答案 |
|---|---|
| Cartoon or Fantasy Violence（卡通或幻想暴力） | **None** ← 见下方⚠ |
| Realistic Violence（写实暴力） | None |
| Prolonged Graphic or Sadistic Realistic Violence | None |
| Profanity or Crude Humor（脏话/粗俗幽默） | None |
| Mature/Suggestive Themes（成人/暗示主题） | None |
| Horror/Fear Themes（恐怖/惊吓） | None |
| Medical/Treatment Information（医疗信息） | None |
| Alcohol, Tobacco, or Drug Use or References | None |
| Simulated Gambling（模拟赌博） | None |
| Sexual Content or Nudity | None |
| Graphic Sexual Content and Nudity | None |
| Contests（竞赛） | None |

**能力类问题（新版分级问卷会问）：**

| 题目 | 答案 |
|---|---|
| Does your app contain **advertisements**?（含广告？） | **YES** |
| Does your app contain **in-app purchases**?（含内购？） | **NO** |
| Does your app contain **user-generated content**? | NO |
| Does your app have **messaging / chat**? | NO |
| **Unrestricted Web Access**（应用内可自由浏览网页？） | **NO** |
| Does your app contain **gambling**? | NO |
| Is your app **made for kids**（儿童类别）? | **NO** ← 重要，见下方⚠⚠ |

> ⚠ **唯一的判断题：锤子「砸鱼」算不算卡通暴力？**
> 我的判断是 **None（不算）**：锤子只是**让格子消失**，没有任何受伤/流血/攻击的表现，鱼图本身
> 是可爱风。同类合成消除游戏（含带"砸/消除"道具的）普遍是 4+。
> **若你想保守**，把这一项选 **"Infrequent/Mild"（偶尔/轻度）** → 分级会变成 **9+**。
> 两者都不影响下载量，也都不会被拒。**我建议 None（→ 大概率 4+）**，因为它更诚实地描述了内容。

> ⚠⚠ **「Made for Kids / 儿童类别」必须选 NO。** 选 YES 会触发一整套儿童隐私要求
> （**禁止第三方广告 / 禁止 IDFA / 禁止追踪**），而我们**正好都用了** → 必被拒。

---

## ② App Privacy 隐私问卷（App Privacy → Data Collection）

**第一题：Do you or your third-party partners collect data from this app?**
→ **YES**（我们自己不收，但 **AdMob 收**——第三方合作方收集也算「收集」）

**然后按 Google 官方 AdMob 披露指引勾以下数据类型。每一项的三个子问都要答：**
*(用途 / 是否关联身份 / 是否用于追踪)*

| 数据类型（ASC 分类） | 用途 Purpose | 关联到用户身份？ | 用于追踪？ |
|---|---|---|---|
| **Identifiers → Device ID**（IDFA/IDFV） | Third-Party Advertising | **No** | **YES** |
| **Usage Data → Advertising Data**（广告展示/点击数据） | Third-Party Advertising | **No** | **YES** |
| **Usage Data → Product Interaction**（app 使用数据） | Analytics | **No** | **No** |
| **Diagnostics → Crash Data** | App Functionality | **No** | **No** |
| **Diagnostics → Performance Data** | App Functionality | **No** | **No** |
| **Diagnostics → Other Diagnostic Data** | App Functionality | **No** | **No** |
| **Location → Coarse Location**（由 IP 推得，AdMob 用于地域定向） | Third-Party Advertising | **No** | **YES** |

**其余全部选「Data Not Collected（不收集）」**，包括：
联系信息 / 健康与健身 / 财务信息 / **精确位置** / 通讯录 / 用户内容 / 浏览历史 / 搜索历史 /
**购买记录**（无内购）/ 敏感信息 / 其他数据。

> ⚠ **「用于追踪 = YES」是必须的**：我们用 IDFA 做跨 app 广告定向，所以 app 里**必须**弹 ATT
> 授权（流水线已注入 `NSUserTrackingUsageDescription`）。**答 No 但实际用了 IDFA = 虚假披露，会被拒。**

> ⚠ **答完必须点「Publish」**，否则提交时报 `APP_DATA_USAGES_REQUIRED`。

---

## ③ 提交时的 IDFA 声明（Submit for Review 页面）

**Does this app use the Advertising Identifier (IDFA)?** → **YES**

勾选用途（**只勾第一项**）：

| 选项 | 勾？ |
|---|---|
| ☑ **Serve advertisements within the app**（在 app 内展示广告） | **✅ 勾** |
| ☐ Attribute this app installation to a previously served advertisement | ❌ 不勾 |
| ☐ Attribute an action taken within this app to a previously served advertisement | ❌ 不勾 |
| ☑ **确认框**："I confirm this app uses the Advertising Identifier and any use is limited to the purposes listed above." | **✅ 勾** |

> 归因两项**不勾**：我们用的是 **SKAdNetwork**（`Info.plist` 里那 50 家清单），它**不依赖 IDFA** 做归因。

---

## ④ 其余提交项（顺手都在这）

| 项 | 答案 |
|---|---|
| **价格** | **免费（Free）** |
| **销售范围** | **全部地区**（175 个） |
| **内购** | 无 |
| **Copyright** | `2026 Zhongyuan Tang` |
| **隐私政策 URL** | `https://fishshoot.ai-speeds.com/privacy.html` |
| **Support URL** | `https://fishshoot.ai-speeds.com/` |
| **Content Rights**（是否含第三方内容） | **No**（美术/音效均为自有/自制） |
| **Export Compliance**（加密） | 已在 `Info.plist` 设 `ITSAppUsesNonExemptEncryption=false` → 提交时**不会再问** |
| **Sign in with Apple** | 不适用（无账号系统） |
| **审核演示账号** | 不需要（`demoAccountRequired: false`） |

**审核联系人**（本账号通用，与 Apple Distribution 证书署名一致）：
- First / Last：`Zhongyuan` / `Tang`
- Phone：`+14039188235`
- Email：`tangzy09@gmail.com`

**审核备注（Review Notes）建议写**：
```
This is an offline single-player puzzle game. No account or login is required.
Ads are served by Google AdMob (rewarded video for an extra life / coins, and
an interstitial between runs). The app requests App Tracking Transparency
because AdMob uses the advertising identifier.
```

---

## ⚠ 提交前最后确认

- [ ] 年龄分级问卷已提交（**Made for Kids = NO**）
- [ ] App Privacy 问卷已答完并**点了 Publish**
- [ ] 价格（免费）+ 销售范围（全球）已设
- [ ] 截图已上传（**改截图必须在提交之前**——提交后要撤回重排队，审核时钟重置）
- [ ] 构建已挂到版本上
- [ ] IDFA 声明已勾
