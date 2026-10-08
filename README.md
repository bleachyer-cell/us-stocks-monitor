# 美股行情监控 · Google Finance

手机、电脑通用的美股行情网页。默认监控 **TSM、AMD、NVDA、TQQQ、MU、SPY、JNJ、LLY**，并可以显示 **AMAT**。

- 最新价（Google Finance 常规交易时段）
- 较昨收（Google Finance 的日内涨跌幅）
- 较开盘：`(最新价 / 当日开盘价 - 1) * 100%`
- 行情时间、30/60/120 秒刷新、排序、持仓关注列表、涨跌颜色
- 抓取失败明确标记，绝不编造数据；网页抓取并非官方实时行情接口

## 启动
需要 Node.js 20+。无需添加 npm 依赖。

```bash
npm start
```

打开 http://localhost:3000 访问网页。接口 `/api/quotes`，健康检查 `/api/health`。

## Render 部署
使用 Node 环境，Build Command: `npm install`，Start Command: `npm start`，Free plan（如账户可用）。当前直接抓取 Google Finance 网页，Google 可能限制服务器请求；不保证报价秒级实时或抓取一定成功。

## 使用范围
仅跟踪行情，不涉及交易、登录或任何下单功能。