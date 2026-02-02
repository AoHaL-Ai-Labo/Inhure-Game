'use client'

import React from "react"
import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Sword, Zap, Skull, Crown, Flame, Shield, Sparkles, Target, Swords, Mountain, Star, CircleDot, Sun, Moon, Eye, Heart, Save, RotateCcw, LogOut, Castle, Sparkle } from 'lucide-react'

const SAVE_KEY = 'inhure-game-save'
const BASE_HP_INITIAL = 100
const PRESSURE_ADD_PER_SEC = 12 // 敵が生きている間、約8秒で拠点に1ヒット
const PRESSURE_DAMAGE = 10 // 圧力100%で拠点が受けるダメージ
const DEATH_UNBANKED_PENALTY = 0.2 // 敗北時未払いゴールドを20%失う（現在はゴールド即入手のため未使用）
const REINCARNATION_MIN_KILLS = 20 // 転生するにはこの討伐数が必要

type SaveData = {
  version: number
  gold: number
  enemyKills: number
  ownedWeaponIds: number[]
  ownedCompanionIds: number[]
  ownedSkillIds: number[]
  unbankedGold?: number
  baseHp?: number
  baseMaxHp?: number
  reincarnationCount?: number
  reincarnationPoints?: number
  permanentAttackPercent?: number
  permanentGoldPercent?: number
  permanentBaseHpPercent?: number
  permanentPressureSlownessPercent?: number
  achievementIds?: number[]
  simpleMode?: boolean
}

// 数値フォーマット関数（兆、京、垓対応）
function formatNumber(num: number): string {
  if (num < 1000) return Math.floor(num).toString()
  if (num < 1000000) return (num / 1000).toFixed(1) + '千'
  if (num < 100000000) return (num / 10000).toFixed(1) + '万'
  if (num < 1000000000000) return (num / 100000000).toFixed(1) + '億'
  if (num < 10000000000000000) return (num / 1000000000000).toFixed(1) + '兆'
  if (num < 100000000000000000000) return (num / 10000000000000000).toFixed(1) + '京'
  return (num / 100000000000000000000).toFixed(1) + '垓'
}

type Enemy = {
  name: string
  hp: number
  maxHp: number
  isBoss: boolean
  reward: number
  icon: React.ElementType
  stage: number
}

type EnemyTemplate = {
  name: string
  hpMultiplier: number
  rewardMultiplier: number
  icon: React.ElementType
  isBoss: boolean
}

type Weapon = {
  id: number
  name: string
  cost: number
  damage: number
  owned: boolean
  icon: React.ElementType
}

type Skill = {
  id: number
  name: string
  cost: number
  owned: boolean
  icon: React.ElementType
  type: 'damage_buff' | 'attack_speed' | 'instant_kill' | 'gold_buff'
  effectValue: number
  description: string
  cooldownSeconds: number
  durationSeconds: number
}

type DamagePopup = {
  id: number
  damage: number
  x: number
  y: number
  isCritical: boolean
}

type Companion = {
  id: number
  name: string
  cost: number
  damageMultiplier: number
  owned: boolean
  icon: React.ElementType
}

export default function EndlessRaidGame() {
  const [gold, setGold] = useState(100)
  /** 未払いゴールド（この周の討伐報酬。撤退で確定、敗北で一部消失） */
  const [unbankedGold, setUnbankedGold] = useState(0)
  const [enemyKills, setEnemyKills] = useState(0)
  const [currentEnemy, setCurrentEnemy] = useState<Enemy | null>(null)
  const [damagePopups, setDamagePopups] = useState<DamagePopup[]>([])
  /** 転生回数・転生ポイント・永続バフ（%）※ baseMaxHp 計算より前に宣言 */
  const [reincarnationCount, setReincarnationCount] = useState(0)
  const [reincarnationPoints, setReincarnationPoints] = useState(0)
  const [permanentAttackPercent, setPermanentAttackPercent] = useState(0)
  const [permanentGoldPercent, setPermanentGoldPercent] = useState(0)
  const [permanentBaseHpPercent, setPermanentBaseHpPercent] = useState(0)
  const [permanentPressureSlownessPercent, setPermanentPressureSlownessPercent] = useState(0)
  /** 拠点HP（敵の圧力で減少。0で敗北）。最大HPは永続バフで増加 */
  const baseMaxHp = Math.floor(BASE_HP_INITIAL * (1 + permanentBaseHpPercent / 100))
  const [baseHp, setBaseHp] = useState(BASE_HP_INITIAL)
  useEffect(() => {
    setBaseHp(h => Math.min(h, baseMaxHp))
  }, [baseMaxHp])
  /** 敵の圧力0-100。溜まると拠点にダメージ */
  const [pressure, setPressure] = useState(0)
  const [isGameOver, setIsGameOver] = useState(false)
  /** 達成済み実績ID */
  const [achievementIds, setAchievementIds] = useState<number[]>([])
  /** シンプルモード: 拠点HP/圧力/未払いなし＝昔のゲーム感 */
  const [simpleMode, setSimpleMode] = useState(true)
  /** 転生・実績カードを開く */
  const [showReincarnationCard, setShowReincarnationCard] = useState(false)
  /** ステージ進行によるゴールド倍率（1 / 1.5 / 2 / 3 / 5） */
  const [stageGoldMultiplier, setStageGoldMultiplier] = useState(1)
  /** スキルによるゴールド倍率（1 = なし、スキル発動中は effectValue） */
  const [skillGoldMultiplier, setSkillGoldMultiplier] = useState(1)
  const goldMultiplier = stageGoldMultiplier * skillGoldMultiplier
  const [bossDefeatAnimation, setBossDefeatAnimation] = useState(false)
  const [rewardAnimation, setRewardAnimation] = useState(false)
  /** スキルごとのクールタイム残り秒数（0で使用可能） */
  const [skillCooldownRemaining, setSkillCooldownRemaining] = useState<{ [key: number]: number }>({})
  const [damageBuff, setDamageBuff] = useState(1)
  const [attackSpeedBuff, setAttackSpeedBuff] = useState(1)
  /** バフ効果の終了時刻（ms）。残り秒数表示用 */
  const damageBuffEndRef = useRef<number | null>(null)
  const attackSpeedBuffEndRef = useRef<number | null>(null)
  const goldBuffEndRef = useRef<number | null>(null)
  const [damageBuffRemainingSec, setDamageBuffRemainingSec] = useState<number | null>(null)
  const [attackSpeedBuffRemainingSec, setAttackSpeedBuffRemainingSec] = useState<number | null>(null)
  const [goldBuffRemainingSec, setGoldBuffRemainingSec] = useState<number | null>(null)
  const pendingLoadRef = useRef(false)
  const hasLoadedOnceRef = useRef(false)
  /** 圧力タイマーが敵の参照変更でリセットされないよう ref で保持 */
  const currentEnemyRef = useRef<Enemy | null>(null)
  const enemyKillsRef = useRef(0)

  const [weapons, setWeapons] = useState<Weapon[]>([
    { id: 1, name: '木の棒', cost: 0, damage: 50, owned: true, icon: Shield },
    { id: 2, name: '錆びた剣', cost: 50, damage: 120, owned: false, icon: Sword },
    { id: 3, name: '鉄の剣', cost: 200, damage: 250, owned: false, icon: Sword },
    { id: 4, name: '鋼鉄の剣', cost: 800, damage: 120, owned: false, icon: Sword },
    { id: 5, name: '炎の剣', cost: 3000, damage: 300, owned: false, icon: Flame },
    { id: 6, name: '雷鳴の刃', cost: 10000, damage: 750, owned: false, icon: Zap },
    { id: 7, name: '聖剣エクスカリバー', cost: 40000, damage: 2000, owned: false, icon: Sparkles },
    { id: 8, name: '闇の大剣', cost: 150000, damage: 5000, owned: false, icon: Target },
    { id: 9, name: '竜殺しの剣', cost: 600000, damage: 12000, owned: false, icon: Swords },
    { id: 10, name: '伝説の魔剣', cost: 2500000, damage: 30000, owned: false, icon: Mountain },
    { id: 11, name: '星の剣', cost: 10000000, damage: 75000, owned: false, icon: Star },
    { id: 12, name: '月光の刃', cost: 40000000, damage: 180000, owned: false, icon: Moon },
    { id: 13, name: '太陽の剣', cost: 160000000, damage: 450000, owned: false, icon: Sun },
    { id: 14, name: '神殺しの剣', cost: 650000000, damage: 1100000, owned: false, icon: Crown },
    { id: 15, name: '創世の剣', cost: 2600000000, damage: 2700000, owned: false, icon: Eye },
    { id: 16, name: '破壊の剣', cost: 10500000000, damage: 6800000, owned: false, icon: Skull },
    { id: 17, name: '終焉の剣', cost: 42000000000, damage: 17000000, owned: false, icon: Zap },
    { id: 18, name: '無限の剣', cost: 170000000000, damage: 42000000, owned: false, icon: CircleDot },
    { id: 19, name: '絶対の剣', cost: 680000000000, damage: 105000000, owned: false, icon: Target },
    { id: 20, name: '究極の剣', cost: 2700000000000, damage: 260000000, owned: false, icon: Star },
    { id: 21, name: '超越の剣', cost: 11000000000000, damage: 650000000, owned: false, icon: Sparkles },
    { id: 22, name: '天上の剣', cost: 44000000000000, damage: 1600000000, owned: false, icon: Sun },
    { id: 23, name: '深淵の剣', cost: 180000000000000, damage: 4000000000, owned: false, icon: Moon },
    { id: 24, name: '混沌の剣', cost: 720000000000000, damage: 10000000000, owned: false, icon: Flame },
    { id: 25, name: '永劫の剣', cost: 2900000000000000, damage: 25000000000, owned: false, icon: Eye },
    { id: 26, name: '次元の剣', cost: 11600000000000000, damage: 62000000000, owned: false, icon: CircleDot },
    { id: 27, name: '虚無の剣', cost: 46000000000000000, damage: 155000000000, owned: false, icon: Skull },
    { id: 28, name: '真理の剣', cost: 190000000000000000, damage: 390000000000, owned: false, icon: Crown },
    { id: 29, name: '全知の剣', cost: 760000000000000000, damage: 980000000000, owned: false, icon: Heart },
    { id: 30, name: '全能の剣', cost: 3000000000000000000, damage: 2400000000000, owned: false, icon: Star },
  ])

  const [companions, setCompanions] = useState<Companion[]>([
    { id: 1, name: '見習い戦士', cost: 100, damageMultiplier: 0.5, owned: false, icon: Shield },
    { id: 2, name: '弓兵', cost: 500, damageMultiplier: 1, owned: false, icon: Target },
    { id: 3, name: '剣士', cost: 2000, damageMultiplier: 2, owned: false, icon: Sword },
    { id: 4, name: '炎の魔術師', cost: 8000, damageMultiplier: 4, owned: false, icon: Flame },
    { id: 5, name: '雷の魔術師', cost: 35000, damageMultiplier: 8, owned: false, icon: Zap },
    { id: 6, name: '聖騎士', cost: 150000, damageMultiplier: 16, owned: false, icon: Sparkles },
    { id: 7, name: '暗殺者', cost: 650000, damageMultiplier: 32, owned: false, icon: Moon },
    { id: 8, name: '竜騎士', cost: 2800000, damageMultiplier: 64, owned: false, icon: Mountain },
    { id: 9, name: '賢者', cost: 12000000, damageMultiplier: 128, owned: false, icon: Eye },
    { id: 10, name: '黄金の騎士', cost: 50000000, damageMultiplier: 256, owned: false, icon: Crown },
    { id: 11, name: '星の守護者', cost: 210000000, damageMultiplier: 512, owned: false, icon: Star },
    { id: 12, name: '終焉の騎士', cost: 900000000, damageMultiplier: 1024, owned: false, icon: Skull },
    { id: 13, name: '天使', cost: 3800000000, damageMultiplier: 2048, owned: false, icon: Sun },
    { id: 14, name: '堕天使', cost: 16000000000, damageMultiplier: 4096, owned: false, icon: Moon },
    { id: 15, name: '神の使徒', cost: 68000000000, damageMultiplier: 8192, owned: false, icon: Crown },
  ])

  const [skills, setSkills] = useState<Skill[]>([
    // ダメージバフ（同種は上書き・重複なし）
    { id: 1, name: '戦意高揚', cost: 1000, owned: false, icon: Sword, type: 'damage_buff', effectValue: 2, description: '20秒間 攻撃力2倍', cooldownSeconds: 45, durationSeconds: 20 },
    { id: 3, name: '炎の鼓舞', cost: 20000, owned: false, icon: Flame, type: 'damage_buff', effectValue: 4, description: '25秒間 攻撃力4倍', cooldownSeconds: 90, durationSeconds: 25 },
    { id: 5, name: '聖なる力', cost: 500000, owned: false, icon: Sparkles, type: 'damage_buff', effectValue: 8, description: '30秒間 攻撃力8倍', cooldownSeconds: 120, durationSeconds: 30 },
    { id: 8, name: '竜の覚醒', cost: 60000000, owned: false, icon: Mountain, type: 'damage_buff', effectValue: 15, description: '40秒間 攻撃力15倍', cooldownSeconds: 180, durationSeconds: 40 },
    { id: 11, name: '破壊の衝動', cost: 7500000000, owned: false, icon: Skull, type: 'damage_buff', effectValue: 30, description: '50秒間 攻撃力30倍', cooldownSeconds: 300, durationSeconds: 50 },
    { id: 14, name: '無限の力', cost: 900000000000, owned: false, icon: Star, type: 'damage_buff', effectValue: 60, description: '60秒間 攻撃力60倍', cooldownSeconds: 420, durationSeconds: 60 },
    // 攻撃速度バフ（同種は上書き）
    { id: 2, name: '猛攻', cost: 5000, owned: false, icon: Swords, type: 'attack_speed', effectValue: 2, description: '20秒間 攻撃速度2倍', cooldownSeconds: 60, durationSeconds: 20 },
    { id: 4, name: '雷の加速', cost: 100000, owned: false, icon: Zap, type: 'attack_speed', effectValue: 3, description: '25秒間 攻撃速度3倍', cooldownSeconds: 90, durationSeconds: 25 },
    { id: 6, name: '闇の狂乱', cost: 2500000, owned: false, icon: Moon, type: 'attack_speed', effectValue: 5, description: '30秒間 攻撃速度5倍', cooldownSeconds: 150, durationSeconds: 30 },
    { id: 10, name: '時の加速', cost: 1500000000, owned: false, icon: CircleDot, type: 'attack_speed', effectValue: 8, description: '40秒間 攻撃速度8倍', cooldownSeconds: 240, durationSeconds: 40 },
    // 即死（個別クールタイム）
    { id: 7, name: '一掃', cost: 12000000, owned: false, icon: Target, type: 'instant_kill', effectValue: 1, description: '1体即死', cooldownSeconds: 20, durationSeconds: 0 },
    { id: 12, name: '殲滅', cost: 37000000000, owned: false, icon: Eye, type: 'instant_kill', effectValue: 10, description: '10体即死', cooldownSeconds: 90, durationSeconds: 0 },
    { id: 15, name: '世界の終焉', cost: 4500000000000, owned: false, icon: Heart, type: 'instant_kill', effectValue: 50, description: '50体即死', cooldownSeconds: 300, durationSeconds: 0 },
    // ゴールドバフ（同種は上書き・ステージ倍率と乗算）※序盤用を追加
    { id: 16, name: '幸運の雫', cost: 3000, owned: false, icon: Crown, type: 'gold_buff', effectValue: 2, description: '15秒間 ゴールド2倍', cooldownSeconds: 45, durationSeconds: 15 },
    { id: 9, name: '黄金の祝福', cost: 300000000, owned: false, icon: Crown, type: 'gold_buff', effectValue: 5, description: '45秒間 ゴールド5倍', cooldownSeconds: 120, durationSeconds: 45 },
    { id: 13, name: '神の恩恵', cost: 180000000000, owned: false, icon: Sun, type: 'gold_buff', effectValue: 15, description: '60秒間 ゴールド15倍', cooldownSeconds: 300, durationSeconds: 60 },
  ])

  // 敵のテンプレート定義（ステージごとに異なる敵が登場）※HP倍率を全体的に上げて敵を厚く
  const enemyTemplates: EnemyTemplate[] = [
    // ステージ1-2: 初級エリア
    { name: '闇の戦士', hpMultiplier: 1.8, rewardMultiplier: 1, icon: Shield, isBoss: false },
    { name: '彷徨う亡霊', hpMultiplier: 2.2, rewardMultiplier: 1.1, icon: Eye, isBoss: false },
    { name: '森の番人', hpMultiplier: 2.8, rewardMultiplier: 1.3, icon: Target, isBoss: false },
    { name: '漆黒の守護者', hpMultiplier: 8, rewardMultiplier: 4, icon: Skull, isBoss: true },
    
    // ステージ3-4: 中級エリア
    { name: '炎の戦士', hpMultiplier: 3.5, rewardMultiplier: 1.8, icon: Flame, isBoss: false },
    { name: '雷鳴の戦士', hpMultiplier: 4.2, rewardMultiplier: 2.2, icon: Zap, isBoss: false },
    { name: '氷結の騎士', hpMultiplier: 5, rewardMultiplier: 2.5, icon: Star, isBoss: false },
    { name: '煉獄の覇王', hpMultiplier: 14, rewardMultiplier: 7, icon: Flame, isBoss: true },
    
    // ステージ5-6: 上級エリア
    { name: '黄金の騎士', hpMultiplier: 6.5, rewardMultiplier: 3.5, icon: Crown, isBoss: false },
    { name: '神聖騎士', hpMultiplier: 8, rewardMultiplier: 4.2, icon: Sparkles, isBoss: false },
    { name: '竜の使徒', hpMultiplier: 10, rewardMultiplier: 5, icon: Swords, isBoss: false },
    { name: '竜王', hpMultiplier: 22, rewardMultiplier: 11, icon: Swords, isBoss: true },
    
    // ステージ7-8: 最上級エリア
    { name: '星の守護者', hpMultiplier: 13, rewardMultiplier: 7, icon: Star, isBoss: false },
    { name: '月の騎士', hpMultiplier: 16, rewardMultiplier: 8.5, icon: Moon, isBoss: false },
    { name: '太陽の戦士', hpMultiplier: 20, rewardMultiplier: 10, icon: Sun, isBoss: false },
    { name: '天界の覇王', hpMultiplier: 32, rewardMultiplier: 16, icon: Sun, isBoss: true },
    
    // ステージ9-10: 神級エリア
    { name: '時の守護者', hpMultiplier: 24, rewardMultiplier: 13, icon: CircleDot, isBoss: false },
    { name: '運命の使者', hpMultiplier: 30, rewardMultiplier: 15, icon: Target, isBoss: false },
    { name: '創世の守護者', hpMultiplier: 38, rewardMultiplier: 18, icon: Eye, isBoss: false },
    { name: '神殺しの魔王', hpMultiplier: 52, rewardMultiplier: 25, icon: Crown, isBoss: true },
    
    // ステージ11+: 超越エリア
    { name: '深淵の住人', hpMultiplier: 48, rewardMultiplier: 22, icon: Skull, isBoss: false },
    { name: '虚無の戦士', hpMultiplier: 60, rewardMultiplier: 27, icon: Eye, isBoss: false },
    { name: '終焉の騎士', hpMultiplier: 78, rewardMultiplier: 35, icon: Zap, isBoss: false },
    { name: '絶対神', hpMultiplier: 105, rewardMultiplier: 50, icon: Heart, isBoss: true },
  ]

  const generateEnemy = useCallback((killCount: number): Enemy => {
    const stage = Math.floor(killCount / 10) + 1
    const isBoss = (killCount + 1) % 10 === 0
    
    // ステージに応じて敵を選択
    let templateIndex: number
    if (stage <= 2) {
      templateIndex = isBoss ? 3 : (killCount % 3)
    } else if (stage <= 4) {
      templateIndex = isBoss ? 7 : (4 + (killCount % 3))
    } else if (stage <= 6) {
      templateIndex = isBoss ? 11 : (8 + (killCount % 3))
    } else if (stage <= 8) {
      templateIndex = isBoss ? 15 : (12 + (killCount % 3))
    } else if (stage <= 10) {
      templateIndex = isBoss ? 19 : (16 + (killCount % 3))
    } else {
      templateIndex = isBoss ? 23 : (20 + (killCount % 3))
    }
    
    const template = enemyTemplates[templateIndex]
    // 敵HP: ステージの3乗×基準値。敵が弱すぎないよう基準を上げ、ボスはさらに1.8倍
    const baseHp = Math.pow(stage, 3) * 140
    const baseReward = Math.pow(stage, 2.5) * 55
    const hp = baseHp * template.hpMultiplier * (template.isBoss ? 1.8 : 1)
    
    return {
      name: `${template.name}`,
      hp,
      maxHp: hp,
      isBoss: template.isBoss,
      reward: baseReward * template.rewardMultiplier * goldMultiplier * (1 + permanentGoldPercent / 100),
      icon: template.icon,
      stage
    }
  }, [goldMultiplier, permanentGoldPercent])

  const getCurrentLevel = useCallback(() => Math.floor(enemyKills / 10) + 1, [enemyKills])

  const getCurrentStage = useCallback(() => Math.floor(enemyKills / 10) + 1, [enemyKills])

  currentEnemyRef.current = currentEnemy
  enemyKillsRef.current = enemyKills

  // 初回のみ敵を生成（セーブロード時は pendingLoadRef で別途設定）
  useEffect(() => {
    if (enemyKills === 0 && !hasLoadedOnceRef.current) {
      setCurrentEnemy(generateEnemy(0))
    }
  }, [generateEnemy, enemyKills])

  // 仲間の自動攻撃（武器の攻撃力ベース）
  useEffect(() => {
    const weapon = getCurrentWeapon()
    
    const interval = setInterval(() => {
      if (!weapon || !currentEnemy) return
      
      const ownedCompanions = companions.filter(c => c.owned)
      if (ownedCompanions.length === 0) return
      
      const totalMultiplier = ownedCompanions.reduce((sum, c) => sum + c.damageMultiplier, 0)
      const damage = (weapon.damage * (1 + permanentAttackPercent / 100) * totalMultiplier * damageBuff) / (10 / attackSpeedBuff)
      const newHp = currentEnemy.hp - damage

      if (newHp <= 0) {
        const reward = currentEnemy.reward
        setGold(prev => prev + reward)
        setEnemyKills(prev => prev + 1)
        setPressure(0)

        if (currentEnemy.isBoss) {
          setBossDefeatAnimation(true)
          setTimeout(() => {
            setBossDefeatAnimation(false)
            setRewardAnimation(true)
            setTimeout(() => setRewardAnimation(false), 2000)
          }, 500)
        }

        setTimeout(() => {
          setCurrentEnemy(generateEnemy(enemyKills + 1))
        }, currentEnemy.isBoss ? 2000 : 300)
      } else {
        setCurrentEnemy({ ...currentEnemy, hp: newHp })
      }
    }, 100)

    return () => clearInterval(interval)
  }, [companions, currentEnemy, enemyKills, generateEnemy, attackSpeedBuff, damageBuff, weapons, permanentAttackPercent, isGameOver])

  // 敵の圧力：敵が生きている間だけ拠点へ溜まる（ref で判定するので自動攻撃中も途切れない）
  const pressureAddPerSec = PRESSURE_ADD_PER_SEC * (1 - permanentPressureSlownessPercent / 100)
  useEffect(() => {
    if (isGameOver) return
    const interval = setInterval(() => {
      if (!currentEnemyRef.current) return
      setPressure(prev => {
        const next = Math.min(100, prev + pressureAddPerSec)
        if (next >= 100) {
          setPressure(0)
          const k = enemyKillsRef.current
          const stage = Math.floor(k / 10) + 1
          const damage = Math.ceil(PRESSURE_DAMAGE * (1 + stage * 0.1))
          setBaseHp(h => Math.max(0, h - damage))
          return 0
        }
        return next
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [isGameOver, pressureAddPerSec])

  // 拠点HPが0で敗北（シンプルモードでは敗北なし）
  useEffect(() => {
    if (!simpleMode && baseHp <= 0 && baseMaxHp > 0) setIsGameOver(true)
  }, [baseHp, baseMaxHp, simpleMode])

  // 実績チェック（討伐数・転生）
  useEffect(() => {
    const toCheck: { id: number; rewardRP: number; done: boolean }[] = [
      { id: 1, rewardRP: 5, done: enemyKills >= 50 },
      { id: 2, rewardRP: 10, done: enemyKills >= 100 },
      { id: 3, rewardRP: 20, done: enemyKills >= 500 },
      { id: 4, rewardRP: 3, done: reincarnationCount >= 1 },
      { id: 5, rewardRP: 15, done: reincarnationCount >= 5 },
    ]
    toCheck.forEach(a => {
      if (!achievementIds.includes(a.id) && a.done) {
        setAchievementIds(prev => [...prev, a.id])
        setReincarnationPoints(prev => prev + a.rewardRP)
      }
    })
  }, [enemyKills, reincarnationCount, achievementIds])

  const addDamagePopup = (damage: number, isCritical: boolean) => {
    const id = Date.now() + Math.random()
    const x = Math.random() * 200 - 100
    const y = Math.random() * 100 - 50
    setDamagePopups(prev => [...prev, { id, damage, x, y, isCritical }])
    setTimeout(() => {
      setDamagePopups(prev => prev.filter(p => p.id !== id))
    }, 1000)
  }

  const getCurrentWeapon = () => {
    const ownedWeapons = weapons.filter(w => w.owned)
    return ownedWeapons.length > 0 ? ownedWeapons[ownedWeapons.length - 1] : null
  }

  /** 次の購入候補の武器（未所持の先頭） */
  const getNextWeapon = () => weapons.find(w => !w.owned) ?? null
  /** 次の購入候補の仲間（未所持の先頭） */
  const getNextCompanion = () => companions.find(c => !c.owned) ?? null
  /** スキル4種それぞれの「表示用」：未所持なら次の購入候補、所持済みならそのタイプの最強を表示 */
  const getSkillForType = (type: Skill['type']) => {
    const ofType = skills.filter(s => s.type === type).sort((a, b) => a.cost - b.cost)
    const next = ofType.find(s => !s.owned)
    if (next) return next
    return ofType[ofType.length - 1] ?? null
  }

  const attack = (multiplier = 1) => {
    if (!currentEnemy) return

    const weapon = getCurrentWeapon()
    if (!weapon) return

    const isCritical = Math.random() < 0.15
    const critMultiplier = isCritical ? 2.5 : 1
    const damage = weapon.damage * (1 + permanentAttackPercent / 100) * multiplier * critMultiplier

    addDamagePopup(damage, isCritical)

    const newHp = currentEnemy.hp - damage

    if (newHp <= 0) {
      const reward = currentEnemy.reward
      setGold(prev => prev + reward)
      setEnemyKills(prev => prev + 1)
      setPressure(0)

      if (currentEnemy.isBoss) {
        setBossDefeatAnimation(true)
        setTimeout(() => {
          setBossDefeatAnimation(false)
          setRewardAnimation(true)
          setTimeout(() => setRewardAnimation(false), 2000)
        }, 500)
      }

      setTimeout(() => {
        setCurrentEnemy(generateEnemy(enemyKills + 1))
      }, currentEnemy.isBoss ? 2000 : 300)
    } else {
      setCurrentEnemy({ ...currentEnemy, hp: newHp })
    }
  }

  /** 休憩：圧力リセット・拠点HP全回復（ゴールドは討伐時に即入手済み） */
  const retreat = () => {
    setPressure(0)
    setBaseHp(baseMaxHp)
  }

  /** 敗北後のコンティニュー：未払いの一部を失い、拠点復活 */
  const continueAfterDefeat = () => {
    const kept = Math.floor(unbankedGold * (1 - DEATH_UNBANKED_PENALTY))
    setGold(prev => prev + kept)
    setUnbankedGold(0)
    setBaseHp(baseMaxHp)
    setPressure(0)
    setIsGameOver(false)
  }

  /** 転生：進行をリセットし転生ポイントを獲得。永続バフで強くなる */
  const reincarnate = () => {
    const stage = getCurrentStage()
    const bossKills = Math.floor(enemyKills / 10)
    const earnedRP = Math.floor(enemyKills / 5) + bossKills * 5 + Math.max(0, stage - 1) * 2
    setReincarnationPoints(prev => prev + earnedRP)
    setReincarnationCount(prev => prev + 1)
    setGold(100)
    setUnbankedGold(0)
    setEnemyKills(0)
    setStageGoldMultiplier(1)
    setSkillGoldMultiplier(1)
    setPressure(0)
    setBaseHp(baseMaxHp)
    setIsGameOver(false)
    setWeapons(prev => prev.map(w => ({ ...w, owned: w.id === 1 })))
    setCompanions(prev => prev.map(c => ({ ...c, owned: false })))
    setSkills(prev => prev.map(s => ({ ...s, owned: false })))
    setDamageBuff(1)
    setAttackSpeedBuff(1)
    setSkillCooldownRemaining({})
    setCurrentEnemy(generateEnemy(0))
  }

  /** 永続バフをRPで購入 */
  const buyPermanentBuff = (type: 'attack' | 'gold' | 'baseHp' | 'pressure') => {
    const costs = { attack: 1, gold: 1, baseHp: 2, pressure: 2 }
    const caps = { attack: 50, gold: 100, baseHp: 50, pressure: 30 }
    const cost = costs[type]
    if (reincarnationPoints < cost) return
    if (type === 'attack' && permanentAttackPercent >= caps.attack) return
    if (type === 'gold' && permanentGoldPercent >= caps.gold) return
    if (type === 'baseHp' && permanentBaseHpPercent >= caps.baseHp) return
    if (type === 'pressure' && permanentPressureSlownessPercent >= caps.pressure) return
    setReincarnationPoints(prev => prev - cost)
    if (type === 'attack') setPermanentAttackPercent(prev => Math.min(caps.attack, prev + 1))
    if (type === 'gold') setPermanentGoldPercent(prev => Math.min(caps.gold, prev + 2))
    if (type === 'baseHp') setPermanentBaseHpPercent(prev => Math.min(caps.baseHp, prev + 5))
    if (type === 'pressure') setPermanentPressureSlownessPercent(prev => Math.min(caps.pressure, prev + 5))
  }

  const buyWeapon = (weaponId: number) => {
    const weapon = weapons.find(w => w.id === weaponId)
    if (weapon && !weapon.owned && gold >= weapon.cost) {
      setGold(prev => prev - weapon.cost)
      setWeapons(prev => prev.map(w => w.id === weaponId ? { ...w, owned: true } : w))
    }
  }

  const buyCompanion = (companionId: number) => {
    const companion = companions.find(c => c.id === companionId)
    if (companion && !companion.owned && gold >= companion.cost) {
      setGold(prev => prev - companion.cost)
      setCompanions(prev => prev.map(c => c.id === companionId ? { ...c, owned: true } : c))
    }
  }

  const buySkill = (skillId: number) => {
    const skill = skills.find(s => s.id === skillId)
    if (skill && !skill.owned && gold >= skill.cost) {
      setGold(prev => prev - skill.cost)
      setSkills(prev => prev.map(s => s.id === skillId ? { ...s, owned: true } : s))
    }
  }

  const useSkill = (skillId: number) => {
    const skill = skills.find(s => s.id === skillId)
    const remaining = skillCooldownRemaining[skillId] ?? 0
    if (!skill || !skill.owned || remaining > 0) return
    if (skill.type === 'instant_kill' && !currentEnemy) return
    setSkillCooldownRemaining(prev => ({ ...prev, [skillId]: skill.cooldownSeconds }))
    
    if (skill.type === 'instant_kill') {
      const killCount = skill.effectValue
      for (let i = 0; i < killCount; i++) {
        setTimeout(() => {
          if (currentEnemy) {
            const reward = currentEnemy.reward
            setGold(prev => prev + reward)
            setEnemyKills(prev => prev + 1)
            setPressure(0)
            setCurrentEnemy(generateEnemy(enemyKills + i + 1))
          }
        }, i * 200)
      }
    } else if (skill.type === 'damage_buff') {
        setDamageBuff(skill.effectValue)
        damageBuffEndRef.current = Date.now() + skill.durationSeconds * 1000
        setTimeout(() => {
          setDamageBuff(1)
          damageBuffEndRef.current = null
          setDamageBuffRemainingSec(null)
        }, skill.durationSeconds * 1000)
      } else if (skill.type === 'attack_speed') {
        setAttackSpeedBuff(skill.effectValue)
        attackSpeedBuffEndRef.current = Date.now() + skill.durationSeconds * 1000
        setTimeout(() => {
          setAttackSpeedBuff(1)
          attackSpeedBuffEndRef.current = null
          setAttackSpeedBuffRemainingSec(null)
        }, skill.durationSeconds * 1000)
      } else if (skill.type === 'gold_buff') {
        setSkillGoldMultiplier(skill.effectValue)
        goldBuffEndRef.current = Date.now() + skill.durationSeconds * 1000
        setTimeout(() => {
          setSkillGoldMultiplier(1)
          goldBuffEndRef.current = null
          setGoldBuffRemainingSec(null)
        }, skill.durationSeconds * 1000)
      }
  }

  // クールタイムを1秒ごとに減算 & バフ残り秒数を更新
  useEffect(() => {
    const interval = setInterval(() => {
      setSkillCooldownRemaining(prev => {
        const next: { [key: number]: number } = {}
        let hasChange = false
        Object.keys(prev).forEach(key => {
          const id = Number(key)
          const v = prev[id]
          if (v > 0) {
            next[id] = Math.max(0, v - 1)
            hasChange = true
          } else {
            next[id] = 0
          }
        })
        return hasChange ? next : prev
      })
      const now = Date.now()
      if (damageBuffEndRef.current != null) {
        const sec = Math.max(0, Math.ceil((damageBuffEndRef.current - now) / 1000))
        setDamageBuffRemainingSec(sec > 0 ? sec : null)
      }
      if (attackSpeedBuffEndRef.current != null) {
        const sec = Math.max(0, Math.ceil((attackSpeedBuffEndRef.current - now) / 1000))
        setAttackSpeedBuffRemainingSec(sec > 0 ? sec : null)
      }
      if (goldBuffEndRef.current != null) {
        const sec = Math.max(0, Math.ceil((goldBuffEndRef.current - now) / 1000))
        setGoldBuffRemainingSec(sec > 0 ? sec : null)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const getTotalDPS = () => {
    const weapon = getCurrentWeapon()
    if (!weapon) return 0
    return companions.filter(c => c.owned).reduce((sum, c) => sum + weapon.damage * (1 + permanentAttackPercent / 100) * c.damageMultiplier * damageBuff, 0) / 10
  }

  const getStageName = (stage: number): string => {
    if (stage <= 2) return '闇の森'
    if (stage <= 4) return '煉獄の谷'
    if (stage <= 6) return '黄金の城'
    if (stage <= 8) return '天界の塔'
    if (stage <= 10) return '神殿'
    return '深淵の果て'
  }

  const getEnemyImage = (stage: number, isBoss: boolean): string => {
    if (isBoss) {
      if (stage <= 2) return '/boss-stage1.png'
      if (stage <= 4) return '/boss-stage3.png'
      if (stage <= 6) return '/boss-stage5.png'
      if (stage <= 8) return '/boss-stage7.png'
      if (stage <= 10) return '/boss-stage9.png'
      return '/boss-stage11.png'
    } else {
      if (stage <= 2) return '/enemy-stage1.png'
      if (stage <= 4) return '/enemy-stage3.png'
      if (stage <= 6) return '/enemy-stage5.png'
      if (stage <= 8) return '/enemy-stage7.png'
      if (stage <= 10) return '/enemy-stage9.png'
      return '/enemy-stage11.png'
    }
  }

  const getBackgroundImage = (stage: number): string => {
    if (stage <= 2) return '/bg-stage1.png'
    if (stage <= 4) return '/bg-stage3.png'
    if (stage <= 6) return '/bg-stage5.png'
    if (stage <= 8) return '/bg-stage7.png'
    if (stage <= 10) return '/bg-stage9.png'
    return '/bg-stage11.png'
  }

  // ステージ進行でゴールド倍率を更新（スキル倍率は別管理のため上書きしない）
  useEffect(() => {
    const stage = getCurrentStage()
    if (stage >= 12) setStageGoldMultiplier(5)
    else if (stage >= 8) setStageGoldMultiplier(3)
    else if (stage >= 5) setStageGoldMultiplier(2)
    else if (stage >= 3) setStageGoldMultiplier(1.5)
    else setStageGoldMultiplier(1)
  }, [enemyKills, getCurrentStage])

  const getNextUnlock = () => {
    const stage = getCurrentStage()
    if (stage < 3) return { stage: 3, reward: 'ゴールド獲得 x1.5', area: '煉獄の谷' }
    if (stage < 5) return { stage: 5, reward: 'ゴールド獲得 x2', area: '黄金の城' }
    if (stage < 8) return { stage: 8, reward: 'ゴールド獲得 x3', area: '天界の塔' }
    if (stage < 12) return { stage: 12, reward: 'ゴールド獲得 x5', area: '深淵の果て' }
    return null
  }

  const getStageGoldFromKills = (kills: number): number => {
    const stage = Math.floor(kills / 10) + 1
    if (stage >= 12) return 5
    if (stage >= 8) return 3
    if (stage >= 5) return 2
    if (stage >= 3) return 1.5
    return 1
  }

  const saveGame = () => {
    const data: SaveData = {
      version: 1,
      gold,
      enemyKills,
      ownedWeaponIds: weapons.filter(w => w.owned).map(w => w.id),
      ownedCompanionIds: companions.filter(c => c.owned).map(c => c.id),
      ownedSkillIds: skills.filter(s => s.owned).map(s => s.id),
      unbankedGold,
      baseHp,
      baseMaxHp,
      reincarnationCount,
      reincarnationPoints,
      permanentAttackPercent,
      permanentGoldPercent,
      permanentBaseHpPercent,
      permanentPressureSlownessPercent,
      achievementIds,
      simpleMode,
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data))
    } catch (e) {
      console.warn('セーブに失敗しました', e)
    }
  }

  const loadGame = () => {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (!raw) return
      const data: SaveData = JSON.parse(raw)
      if (data.version !== 1) return
      hasLoadedOnceRef.current = true
      setGold(data.gold)
      setEnemyKills(data.enemyKills)
      setStageGoldMultiplier(getStageGoldFromKills(data.enemyKills))
      setSkillGoldMultiplier(1)
      setWeapons(prev => prev.map(w => ({ ...w, owned: data.ownedWeaponIds.includes(w.id) })))
      setCompanions(prev => prev.map(c => ({ ...c, owned: data.ownedCompanionIds.includes(c.id) })))
      setSkills(prev => prev.map(s => ({ ...s, owned: data.ownedSkillIds.includes(s.id) })))
      if (data.unbankedGold != null) setUnbankedGold(data.unbankedGold)
      if (data.baseHp != null) setBaseHp(data.baseHp)
      if (data.reincarnationCount != null) setReincarnationCount(data.reincarnationCount)
      if (data.reincarnationPoints != null) setReincarnationPoints(data.reincarnationPoints)
      if (data.permanentAttackPercent != null) setPermanentAttackPercent(data.permanentAttackPercent)
      if (data.permanentGoldPercent != null) setPermanentGoldPercent(data.permanentGoldPercent)
      if (data.permanentBaseHpPercent != null) setPermanentBaseHpPercent(data.permanentBaseHpPercent)
      if (data.permanentPressureSlownessPercent != null) setPermanentPressureSlownessPercent(data.permanentPressureSlownessPercent)
      if (data.achievementIds != null) setAchievementIds(data.achievementIds)
      setSimpleMode(data.simpleMode ?? false)
      setPressure(0)
      pendingLoadRef.current = true
    } catch (e) {
      console.warn('ロードに失敗しました', e)
    }
  }

  const resetGame = () => {
    if (typeof window === 'undefined') return
    try {
      localStorage.removeItem(SAVE_KEY)
      window.location.reload()
    } catch (e) {
      console.warn('リセットに失敗しました', e)
    }
  }

  // ロード後に現在の敵を再生成
  useEffect(() => {
    if (pendingLoadRef.current) {
      pendingLoadRef.current = false
      setCurrentEnemy(generateEnemy(enemyKills))
    }
  }, [enemyKills, generateEnemy])

  // 起動時にセーブがあれば続きから
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem(SAVE_KEY)) loadGame()
  }, [])

  const hpPercentage = currentEnemy ? (currentEnemy.hp / currentEnemy.maxHp) * 100 : 0

  const handleBuySkill = (skillId: number) => {
    buySkill(skillId)
  }

  const handleUseSkill = (skillId: number) => {
    useSkill(skillId)
  }

  return (
    <div className="min-h-screen text-foreground p-4 flex flex-col items-center justify-center relative overflow-hidden">
      {/* ステージごとの背景画像（せっかく作ったのでしっかり見せる） */}
      <div className="absolute inset-0">
        {(() => {
          const bgSrc = getBackgroundImage(getCurrentStage())
          if (bgSrc && bgSrc !== '/placeholder.svg') {
            return (
              <img 
                src={bgSrc}
                alt="background"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            )
          }
          return <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black" />
        })()}
        {/* 薄いオーバーレイ：背景は見せつつUIの視認性を確保 */}
        <div className="absolute inset-0 bg-black/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40 pointer-events-none" />
      </div>
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div className="absolute top-20 left-20 w-96 h-96 bg-amber-500 rounded-full blur-[120px]" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-amber-600 rounded-full blur-[120px]" />
      </div>

      <AnimatePresence>
        {bossDefeatAnimation && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none"
          >
            <motion.div
              initial={{ scale: [1, 1.2, 1], rotate: [0, 5, -5, 0] }}
              animate={{ scale: [1, 1.2, 1], rotate: [0, 5, -5, 0] }}
              transition={{ duration: 0.5 }}
              className="text-6xl font-bold text-amber-400"
            >
              BOSS DEFEATED!
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {rewardAnimation && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="absolute top-1/3 left-1/2 -translate-x-1/2 z-40 pointer-events-none"
          >
            <motion.div animate={{ y: [0, -20, 0] }} transition={{ duration: 1, repeat: 2 }} className="relative">
              <div className="w-24 h-24 text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]">
                <Crown className="w-24 h-24 text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]" />
              </div>
              {[...Array(12)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 0, x: 0, y: 0 }}
                  animate={{
                    scale: [0, 1, 0],
                    x: Math.cos(i * 30 * Math.PI / 180) * 100,
                    y: Math.sin(i * 30 * Math.PI / 180) * 100,
                  }}
                  transition={{ duration: 1.5, delay: i * 0.05 }}
                  className="absolute top-1/2 left-1/2 w-3 h-3 bg-amber-400 rounded-full"
                />
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 敗北モーダル */}
      <AnimatePresence>
        {isGameOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border-2 border-red-500/50 rounded-xl p-8 max-w-md w-full text-center space-y-4"
            >
              <h2 className="text-2xl font-bold text-red-400">拠点制圧 … 敗北</h2>
              <p className="text-muted-foreground text-sm">
                ゴールドは討伐時に即入手済み。コンティニューで拠点を再防衛できます。
              </p>
              <p className="text-amber-400 text-sm">
                所持: {formatNumber(gold)}
              </p>
              <div className="flex gap-3 justify-center pt-2">
                <Button onClick={continueAfterDefeat} className="bg-amber-600 hover:bg-amber-500">
                  コンティニュー（拠点再防衛）
                </Button>
                <Button onClick={resetGame} variant="outline" className="border-zinc-500">
                  タイトルへ
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl w-full space-y-6 relative z-10">
        {/* 拠点HP・敵の圧力（常に表示して見えるように） */}
        <div className="space-y-2 p-3 rounded-lg bg-black/40 border border-white/10">
          <div className="flex items-center gap-2 text-sm">
            <Castle className="w-4 h-4 text-amber-500" />
            <span className="font-semibold text-amber-400">拠点HP</span>
            <span className="text-red-300 font-bold">{baseHp}</span>
            <span className="text-zinc-500">/</span>
            <span className="text-zinc-300">{baseMaxHp}</span>
          </div>
          <div className="h-3 rounded-full bg-zinc-800 overflow-hidden border border-zinc-600">
            <div
              className="h-full bg-gradient-to-r from-red-600 to-amber-500 transition-all duration-300"
              style={{ width: `${(baseHp / baseMaxHp) * 100}%` }}
            />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-orange-400">敵の圧力</span>
            <span className="text-orange-300 font-bold">{pressure}%</span>
            <span className="text-muted-foreground text-xs">（100%で拠点にダメージ）</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden border border-zinc-600">
            <div
              className="h-full bg-gradient-to-r from-orange-600 to-red-500 transition-all duration-300"
              style={{ width: `${pressure}%` }}
            />
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-3">
          <h1 className="text-4xl font-bold text-balance bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-400 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]">
            Endless Raid
          </h1>
          <p className="text-sm text-muted-foreground">冒険者の限界突破</p>
          {/* メイン操作：大きめボタンで操作しやすく */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {!simpleMode && (
              <Button
                onClick={retreat}
              variant="outline"
              size="default"
              className="min-h-11 border-emerald-600/50 text-emerald-400 hover:bg-emerald-500/10"
            >
              <LogOut className="w-4 h-4 mr-2" />
              休憩（圧力リセット・拠点回復）
            </Button>
            )}
            <Button
              onClick={saveGame}
              variant="outline"
              size="default"
              className="min-h-11 border-amber-600/50 text-amber-400 hover:bg-amber-500/10"
            >
              <Save className="w-4 h-4 mr-2" />
              セーブ
            </Button>
            <Button
              onClick={resetGame}
              variant="outline"
              size="default"
              className="min-h-11 border-zinc-600 text-muted-foreground hover:bg-zinc-700/50 hover:text-destructive"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              リセット
            </Button>
            <Button
              onClick={() => setShowReincarnationCard(prev => !prev)}
              variant="outline"
              size="default"
              className="min-h-11 border-purple-600/50 text-purple-400 hover:bg-purple-500/10"
            >
              <Sparkle className="w-4 h-4 mr-2" />
              転生・実績 {showReincarnationCard ? '▲' : '▼'}
            </Button>
            <Button
              onClick={() => setSimpleMode(prev => !prev)}
              variant="outline"
              size="default"
              className="min-h-11 border-zinc-500 text-muted-foreground hover:bg-zinc-700/50"
            >
              {simpleMode ? 'シンプル' : '緊張'}
            </Button>
          </div>
        </motion.div>

        {/* 戦闘エリア：敵グラフィック・拠点ダメージがはっきり見えるように */}
        <Card className="p-6 bg-black/40 border-2 border-amber-500/30 backdrop-blur-sm relative overflow-visible min-h-[320px] flex flex-col justify-center">
          {currentEnemy && (
            <div className="space-y-4 relative">
              <div className="flex flex-col items-center gap-4">
                <motion.div
                  animate={{
                    scale: currentEnemy.isBoss ? [1, 1.05, 1] : [1, 1.02, 1],
                    y: currentEnemy.isBoss ? [0, -5, 0] : [0, -3, 0],
                  }}
                  transition={{ duration: currentEnemy.isBoss ? 2 : 3, repeat: Infinity, ease: "easeInOut" }}
                  className="relative"
                >
                  <div className={`relative rounded-2xl overflow-hidden flex items-center justify-center shadow-xl ${
                    currentEnemy.isBoss 
                      ? 'w-48 h-48 border-4 border-amber-500/80 shadow-amber-500/50 bg-zinc-900/90' 
                      : 'w-40 h-40 border-2 border-amber-400/40 bg-zinc-900/90'
                  }`}>
                    {/* 下地：常にアイコン表示（画像失敗時も見える） */}
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-800/90 z-0">
                      <currentEnemy.icon className={`${currentEnemy.isBoss ? 'w-24 h-24' : 'w-20 h-20'} text-amber-400/80`} />
                    </div>
                    {/* 敵グラフィック：Next.js Image で public の画像を表示（失敗時は非表示で下地のアイコンが見える） */}
                    {(() => {
                      const imageSrc = getEnemyImage(currentEnemy.stage, currentEnemy.isBoss)
                      if (!imageSrc) return null
                      return (
                        <div key={`enemy-${enemyKills}-${currentEnemy.stage}-${currentEnemy.isBoss ? 'boss' : 'mob'}`} className="absolute inset-0 z-10">
                          <div className="relative w-full h-full">
                            <Image
                              src={imageSrc}
                              alt={currentEnemy.name}
                              fill
                              sizes={currentEnemy.isBoss ? '192px' : '160px'}
                              className="object-cover"
                              unoptimized
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                              }}
                            />
                          </div>
                        </div>
                      )
                    })()}
                    {currentEnemy.isBoss && (
                      <div className="absolute inset-0 bg-gradient-to-t from-amber-500/20 via-transparent to-transparent animate-pulse pointer-events-none z-20" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none z-20" />
                  </div>
                </motion.div>
                
                <div className="text-center">
                  <h2 className={`text-2xl font-bold drop-shadow-[0_0_8px_rgba(0,0,0,0.9)] ${currentEnemy.isBoss ? 'text-amber-400' : 'text-white'}`}>
                    {currentEnemy.name}
                  </h2>
                  <p className="text-sm text-amber-200 drop-shadow-[0_0_4px_rgba(0,0,0,0.9)] mt-1">
                    報酬: {formatNumber(currentEnemy.reward)} ゴールド
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm items-center">
                  <span className="font-semibold text-red-400 drop-shadow-[0_0_4px_rgba(0,0,0,0.9)]">敵HP</span>
                  <span className="font-bold tabular-nums text-white drop-shadow-[0_0_4px_rgba(0,0,0,0.9)]">
                    <span className="text-red-300">{formatNumber(currentEnemy.hp)}</span>
                    <span className="text-zinc-400 mx-1">/</span>
                    <span className="text-zinc-300">{formatNumber(currentEnemy.maxHp)}</span>
                  </span>
                </div>
                <div className="relative rounded-full h-5 bg-black/40 border border-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      currentEnemy.isBoss
                        ? 'bg-gradient-to-r from-red-600 via-red-500 to-amber-500'
                        : hpPercentage > 50
                          ? 'bg-gradient-to-r from-emerald-600 to-green-500'
                          : hpPercentage > 25
                            ? 'bg-gradient-to-r from-amber-500 to-yellow-500'
                            : 'bg-gradient-to-r from-red-600 to-red-500'
                    }`}
                    style={{ width: `${hpPercentage}%` }}
                  />
                </div>
              </div>

              <div className="absolute inset-0 pointer-events-none">
                <AnimatePresence>
                  {damagePopups.map(popup => (
                    <motion.div
                      key={popup.id}
                      initial={{ opacity: 1, y: 0, scale: 1 }}
                      animate={{
                        opacity: 0,
                        y: -100,
                        x: popup.x,
                        scale: popup.isCritical ? 1.5 : 1,
                      }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1 }}
                      className={`absolute top-1/2 left-1/2 font-bold drop-shadow-[0_0_6px_rgba(0,0,0,0.9)] ${popup.isCritical ? 'text-3xl text-amber-400' : 'text-xl text-white'}`}
                      style={{ x: popup.x, y: popup.y }}
                    >
                      {formatNumber(popup.damage)}
                      {popup.isCritical && '!!!'}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              <motion.div whileTap={{ scale: 0.95 }}>
                <Button
                  onClick={() => attack()}
                  size="lg"
                  className="w-full h-16 text-xl font-bold bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-zinc-950 shadow-[0_0_20px_rgba(251,191,36,0.4)] border-2 border-amber-400"
                >
                  <Sword className="w-6 h-6 mr-2" />
                  攻撃
                </Button>
              </motion.div>
              {(companions.filter(c => c.owned).length > 0 || damageBuff > 1 || attackSpeedBuff > 1 || skillGoldMultiplier > 1) && (
                <div className="text-center p-2 bg-black/30 rounded-lg border border-white/10 text-xs text-amber-400/90 space-y-1">
                  <p>
                    自動攻撃: x{attackSpeedBuff}
                    {attackSpeedBuffRemainingSec != null && <span className="text-amber-300"> （残り{attackSpeedBuffRemainingSec}秒）</span>}
                    {' | '}ダメージ: x{damageBuff}
                    {damageBuffRemainingSec != null && <span className="text-amber-300"> （残り{damageBuffRemainingSec}秒）</span>}
                    {skillGoldMultiplier > 1 && (
                      <> | ゴールド: x{skillGoldMultiplier}{goldBuffRemainingSec != null && <span className="text-amber-300"> （残り{goldBuffRemainingSec}秒）</span>}</>
                    )}
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* 転生・永続バフ（折りたたみ可能） */}
        {showReincarnationCard && (
          <Card className="p-4 bg-zinc-900/90 border-zinc-800 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Sparkle className="w-5 h-5 text-purple-400" />
                <span className="font-bold text-purple-400">転生ポイント</span>
                <span className="text-2xl font-bold text-foreground">{reincarnationPoints}</span>
                <span className="text-sm text-muted-foreground">（転生{reincarnationCount}回）</span>
              </div>
              <Button
                onClick={reincarnate}
                disabled={enemyKills < REINCARNATION_MIN_KILLS}
                variant="outline"
                size="default"
                className="border-purple-500 text-purple-400 min-h-10"
                title={enemyKills < REINCARNATION_MIN_KILLS ? `討伐${REINCARNATION_MIN_KILLS}体以上で転生可能` : undefined}
              >
                <RotateCcw className="w-4 h-4 mr-2" /> 転生する（討伐{enemyKills}/{REINCARNATION_MIN_KILLS}・RP獲得）
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Button
                onClick={() => buyPermanentBuff('attack')}
                disabled={reincarnationPoints < 1 || permanentAttackPercent >= 50}
                variant="outline"
                size="default"
                className="min-h-10 border-amber-600/50 text-amber-400 text-left justify-start"
              >
                攻撃+1%（1RP）<br /><span className="text-xs opacity-90">現在{permanentAttackPercent}%</span>
              </Button>
              <Button
                onClick={() => buyPermanentBuff('gold')}
                disabled={reincarnationPoints < 1 || permanentGoldPercent >= 100}
                variant="outline"
                size="default"
                className="min-h-10 border-amber-600/50 text-amber-400 text-left justify-start"
              >
                ゴールド+2%（1RP）<br /><span className="text-xs opacity-90">現在{permanentGoldPercent}%</span>
              </Button>
              <Button
                onClick={() => buyPermanentBuff('baseHp')}
                disabled={reincarnationPoints < 2 || permanentBaseHpPercent >= 50}
                variant="outline"
                size="default"
                className="min-h-10 border-red-600/50 text-red-400 text-left justify-start"
              >
                拠点HP+5%（2RP）<br /><span className="text-xs opacity-90">現在{permanentBaseHpPercent}%</span>
              </Button>
              <Button
                onClick={() => buyPermanentBuff('pressure')}
                disabled={reincarnationPoints < 2 || permanentPressureSlownessPercent >= 30}
                variant="outline"
                size="default"
                className="min-h-10 border-orange-600/50 text-orange-400 text-left justify-start"
              >
                圧力遅延+5%（2RP）<br /><span className="text-xs opacity-90">現在{permanentPressureSlownessPercent}%</span>
              </Button>
            </div>
            <div className="mt-3 pt-3 border-t border-zinc-700 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">実績:</span>{' '}
              {[
                { id: 1, name: '討伐50' },
                { id: 2, name: '討伐100' },
                { id: 3, name: '討伐500' },
                { id: 4, name: '転生1回' },
                { id: 5, name: '転生5回' },
              ].map(a => (
                <span key={a.id} className={achievementIds.includes(a.id) ? 'text-amber-400' : ''}>
                  {achievementIds.includes(a.id) ? '✓' : '○'}
                  {a.name}{' '}
                </span>
              ))}
            </div>
          </Card>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-4 bg-black/30 border-white/10 backdrop-blur-sm">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div className="space-y-1">
                <p className="text-muted-foreground">ゴールド</p>
                <p className="text-2xl font-bold text-amber-400">{formatNumber(gold)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">討伐数</p>
                <p className="text-2xl font-bold text-foreground">{enemyKills}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">自動DPS</p>
                <p className="text-2xl font-bold text-amber-500">{formatNumber(getTotalDPS())}/秒</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-black/30 border-white/10 backdrop-blur-sm">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <p className="text-muted-foreground text-sm">現在のステージ</p>
                <p className="text-2xl font-bold text-amber-400">Stage {getCurrentStage()}</p>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-muted-foreground text-sm">エリア</p>
                <p className="text-lg font-bold text-foreground">{getStageName(getCurrentStage())}</p>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-muted-foreground text-sm">ゴールドボーナス</p>
                <p className="text-lg font-bold text-amber-500">x{goldMultiplier}</p>
              </div>
              {getNextUnlock() && (
                <div className="pt-2 border-t border-zinc-800">
                  <p className="text-xs text-muted-foreground">次の解放: Stage {getNextUnlock()?.stage}</p>
                  <p className="text-xs text-amber-300">{getNextUnlock()?.area}</p>
                  <p className="text-sm font-bold text-amber-400">{getNextUnlock()?.reward}</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* 武器・仲間・スキル：スクロールなし・次のものだけ・1枚に収める */}
        <Card className="p-4 bg-black/35 border-white/10 backdrop-blur-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {/* 武器：現在＋次の1つ */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-amber-400">武器</h3>
              {(() => {
                const current = getCurrentWeapon()
                const next = getNextWeapon()
                return (
                  <>
                    {current && (() => {
                      const Icon = current.icon
                      return (
                        <div className="flex items-center gap-2 bg-zinc-800/80 border border-amber-600/50 p-2 rounded text-sm">
                          <Icon className="w-4 h-4 text-amber-400" />
                          <span className="font-bold flex-1">{current.name}</span>
                          <span className="text-amber-400 text-xs">{formatNumber(current.damage)}</span>
                        </div>
                      )
                    })()}
                    {next && (() => {
                      const Icon = next.icon
                      return (
                        <Button
                          onClick={() => buyWeapon(next.id)}
                          disabled={gold < next.cost}
                          variant="outline"
                          size="sm"
                          className="w-full border-zinc-600 text-left justify-start"
                        >
                          <Icon className="w-4 h-4 mr-2" />
                          <span className="flex-1 text-xs">{next.name}</span>
                          <span className="text-xs">{formatNumber(next.cost)}</span>
                        </Button>
                      )
                    })()}
                    {!next && current && (
                      <p className="text-xs text-muted-foreground">全武器所持</p>
                    )}
                  </>
                )
              })()}
            </div>
            {/* 仲間：現在＋次の1つ */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-amber-400">仲間</h3>
              {companions.filter(c => c.owned).length > 0 && (
                <div className="flex items-center gap-2 bg-zinc-800/80 border border-amber-600/50 p-2 rounded text-sm">
                  <span className="text-amber-400 text-xs">x{companions.filter(c => c.owned).length}人</span>
                  <span className="text-xs text-muted-foreground">DPS: {formatNumber(getTotalDPS())}/秒</span>
                </div>
              )}
              {(() => {
                const next = getNextCompanion()
                if (!next) {
                  if (companions.every(c => c.owned)) return <p className="text-xs text-muted-foreground">全員雇用済み</p>
                  return null
                }
                const Icon = next.icon
                return (
                  <Button
                    onClick={() => buyCompanion(next.id)}
                    disabled={gold < next.cost}
                    variant="outline"
                    size="sm"
                    className="w-full border-zinc-600 text-left justify-start"
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    <span className="flex-1 text-xs">{next.name} (x{next.damageMultiplier})</span>
                    <span className="text-xs">{formatNumber(next.cost)}</span>
                  </Button>
                )
              })()}
            </div>
          </div>
          {/* スキル：攻撃・スピード・お金・即死の4種をバランスよく1行に */}
          <h3 className="text-sm font-bold text-amber-400 mb-2">スキル</h3>
          <div className="grid grid-cols-4 gap-2">
            {(['damage_buff', 'attack_speed', 'gold_buff', 'instant_kill'] as const).map(type => {
              const skill = getSkillForType(type)
              if (!skill) return <div key={type} className="min-h-[80px] rounded border border-zinc-700/50 bg-zinc-800/30 flex items-center justify-center text-xs text-muted-foreground">—</div>
              const cd = skillCooldownRemaining[skill.id] ?? 0
              const onCooldown = cd > 0
              const labels = { damage_buff: '攻撃', attack_speed: 'スピード', gold_buff: 'お金', instant_kill: '即死' }
              return (
                <div key={skill.id} className="flex flex-col min-h-[80px]">
                  <span className="text-[10px] text-muted-foreground mb-0.5 text-center">{labels[skill.type]}</span>
                  {skill.owned ? (
                    <Button
                      onClick={() => useSkill(skill.id)}
                      disabled={onCooldown}
                      className="flex-1 min-h-[72px] bg-amber-800/80 hover:bg-amber-700/80 text-foreground flex flex-col items-center justify-center py-2 px-1"
                      size="sm"
                    >
                      <skill.icon className="w-5 h-5 mb-1 shrink-0" />
                      <span className="text-xs font-bold leading-tight line-clamp-2">{skill.name}</span>
                      {onCooldown ? <span className="text-[10px] text-amber-300 mt-0.5">CD {cd}秒</span> : <span className="text-[10px] opacity-80 mt-0.5 line-clamp-2">{skill.description}</span>}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => buySkill(skill.id)}
                      disabled={gold < skill.cost}
                      variant="outline"
                      size="sm"
                      className="flex-1 min-h-[72px] border-zinc-600 flex flex-col items-center justify-center py-2 px-1"
                    >
                      <skill.icon className="w-5 h-5 mb-1 shrink-0 text-muted-foreground" />
                      <span className="text-xs leading-tight line-clamp-2">{skill.name}</span>
                      <span className="text-[10px] text-amber-400 mt-0.5">{formatNumber(skill.cost)}</span>
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}
