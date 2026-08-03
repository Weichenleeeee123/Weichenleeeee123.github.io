---
wpt: 1
title: AlphaBit Coach
subtitle: MULTI-AGENT INVESTMENT RESEARCH
status: awarded
statusLabel: 一等奖
date: 2026-07
role: 产品设计 · 核心架构 · 部署 · Pitch
summary: 看得见的 AI 投研团队。Manager Agent 按问题动态组建 research / quant / macro / risk / report 专家，生成任务 DAG，在一间像素风办公室里把多 Agent 协作实时演出来。所有结论只能来自真实的 ExpertResult——模型不允许编造补齐。
metrics:
  - { k: 团队提交, v: 91 / 147 }
  - { k: 个人增行, v: '+32,840' }
  - { k: 工期, v: 4 天 }
  - { k: 测试代码, v: '11,159 行' }
quote:
  text: 没有炫技也没有堆砌功能，而是真正站在用户视角重新回答问题。不是为比赛而生的 Demo，而是一把真正能帮普通人进入 AI Trading 世界的锤子。
  by: PandaAI 赛道评委 · AdventureX 2026
tags: [LangGraph, A2A 协议, 多智能体编排, Skill 沙箱, Policy Gate]
links:
  - { label: GITHUB, href: 'https://github.com/Alia0415/AlphaBit-Coach' }
tier: primary
detail: true
---

## 这东西解决什么

普通人打不开 AI Trading 的门，不是因为没有工具，是因为所有工具都在给你一个结论，却不给你产生结论的过程。你不知道它凭什么这么说，于是你也不敢用。

AlphaBit Coach 的选择是**把过程摊开给你看**。你问一个问题，Manager Agent 当场决定这次要请哪几个专家（research / quant / macro / risk / report），把它们排成一张任务 DAG，然后你在一间像素风的办公室里看着这几个 Agent 跑来跑去、互相递结果。结论出来的时候，你已经看完了它是怎么来的。

## 两条硬规矩

**第一，模型不许编。** 报告里的每一个结论都必须能追回到某个专家真实返回的 ExpertResult。缺数据就写缺数据，不允许用模型的先验知识把空缺补圆。这条规矩砍掉了很多「看起来更完整」的输出，但它是这个产品敢让普通人用的唯一理由。

**第二，Skill 必须可校验。** 所有专家能力以 Skill 形式装载，`skills.lock.json` 锁版本 + SHA-256 校验，跑之前先过 Policy Gate。多 Agent 系统最脏的地方是你不知道某一步到底执行了什么，我们把它变成了可审计的。

## 教练层

拿了结论之后还有一层：通俗视图 / 专业视图双开，可以追问，可以点术语，可以复盘。这一层是评委反复提的地方——它不产生任何新信息，只是把同样的信息按「你现在懂多少」重新组织一遍。

## 4 天

AdventureX 2026 现场，杭州，我人生第一次线下黑客松。全队 4 个人 147 次提交，我占 91 次；39,488 行代码里有 11,159 行是测试。我负责产品设计、核心架构、部署和最后上台 Pitch。

拿了 PandaAI「Build the Next AI Trader」赛道一等奖。赛道方的技术负责人当场说了一句我大概会记很久的话：「在一些用户使用逻辑上，AlphaBit Coach 做的比我们更 nb。」
