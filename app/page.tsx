'use client'

import React from "react"
import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Sword, Zap, Skull, Crown, Flame, Shield, Sparkles, Target, Swords, Mountain, Star, CircleDot, Sun, Moon, Eye, Heart } from 'lucide-react'

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
  const [enemyKills, setEnemyKills] = useState(0)
  const [currentEnemy, setCurrentEnemy] = useState<Enemy | null>(null)
  const [damagePopups, setDamagePopups] = useState<DamagePopup[]>([])
  const [goldMultiplier, setGoldMultiplier] = useState(1)
  const [bossDefeatAnimation, setBossDefeatAnimation] = useState(false)
  const [rewardAnimation, setRewardAnimation] = useState(false)
  const [skillCooldowns, setSkillCooldowns] = useState<{ [key: number]: boolean }>({})
  const [damageBuff, setDamageBuff] = useState(1)
  const [attackSpeedBuff, setAttackSpeedBuff] = useState(1)

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
    { id: 1, name: '戦意高揚', cost: 1000, owned: false, icon: Sword, type: 'damage_buff', effectValue: 3, description: '30秒間仲間の攻撃力3倍' },
    { id: 2, name: '猛攻', cost: 5000, owned: false, icon: Swords, type: 'attack_speed', effectValue: 2, description: '30秒間攻撃速度2倍' },
    { id: 3, name: '炎の鼓舞', cost: 20000, owned: false, icon: Flame, type: 'damage_buff', effectValue: 5, description: '30秒間仲間の攻撃力5倍' },
    { id: 4, name: '雷の加速', cost: 100000, owned: false, icon: Zap, type: 'attack_speed', effectValue: 3, description: '30秒間攻撃速度3倍' },
    { id: 5, name: '聖なる力', cost: 500000, owned: false, icon: Sparkles, type: 'damage_buff', effectValue: 10, description: '30秒間仲間の攻撃力10倍' },
    { id: 6, name: '闇の狂乱', cost: 2500000, owned: false, icon: Moon, type: 'attack_speed', effectValue: 5, description: '30秒間攻撃速度5倍' },
    { id: 7, name: '一掃', cost: 12000000, owned: false, icon: Target, type: 'instant_kill', effectValue: 1, description: '現在の敵を即死させる' },
    { id: 8, name: '竜の覚醒', cost: 60000000, owned: false, icon: Mountain, type: 'damage_buff', effectValue: 20, description: '30秒間仲間の攻撃力20倍' },
    { id: 9, name: '黄金の祝福', cost: 300000000, owned: false, icon: Crown, type: 'gold_buff', effectValue: 10, description: '60秒間ゴールド獲得10倍' },
    { id: 10, name: '時の加速', cost: 1500000000, owned: false, icon: CircleDot, type: 'attack_speed', effectValue: 10, description: '30秒間攻撃速度10倍' },
    { id: 11, name: '破壊の衝動', cost: 7500000000, owned: false, icon: Skull, type: 'damage_buff', effectValue: 50, description: '30秒間仲間の攻撃力50倍' },
    { id: 12, name: '殲滅', cost: 37000000000, owned: false, icon: Eye, type: 'instant_kill', effectValue: 10, description: '次の10体を即死させる' },
    { id: 13, name: '神の恩恵', cost: 180000000000, owned: false, icon: Sun, type: 'gold_buff', effectValue: 50, description: '60秒間ゴールド獲得50倍' },
    { id: 14, name: '無限の力', cost: 900000000000, owned: false, icon: Star, type: 'damage_buff', effectValue: 100, description: '30秒間仲間の攻撃力100倍' },
    { id: 15, name: '世界の終焉', cost: 4500000000000, owned: false, icon: Heart, type: 'instant_kill', effectValue: 100, description: '次の100体を即死させる' },
  ])

  // 敵のテンプレート定義（ステージごとに異なる敵が登場）
  const enemyTemplates: EnemyTemplate[] = [
    // ステージ1-2: 初級エリア
    { name: '闇の戦士', hpMultiplier: 1, rewardMultiplier: 1, icon: Shield, isBoss: false },
    { name: '彷徨う亡霊', hpMultiplier: 1.2, rewardMultiplier: 1.1, icon: Eye, isBoss: false },
    { name: '森の番人', hpMultiplier: 1.5, rewardMultiplier: 1.3, icon: Target, isBoss: false },
    { name: '漆黒の守護者', hpMultiplier: 5, rewardMultiplier: 4, icon: Skull, isBoss: true },
    
    // ステージ3-4: 中級エリア
    { name: '炎の戦士', hpMultiplier: 2, rewardMultiplier: 1.8, icon: Flame, isBoss: false },
    { name: '雷鳴の戦士', hpMultiplier: 2.5, rewardMultiplier: 2.2, icon: Zap, isBoss: false },
    { name: '氷結の騎士', hpMultiplier: 3, rewardMultiplier: 2.5, icon: Star, isBoss: false },
    { name: '煉獄の覇王', hpMultiplier: 8, rewardMultiplier: 7, icon: Flame, isBoss: true },
    
    // ステージ5-6: 上級エリア
    { name: '黄金の騎士', hpMultiplier: 4, rewardMultiplier: 3.5, icon: Crown, isBoss: false },
    { name: '神聖騎士', hpMultiplier: 5, rewardMultiplier: 4.2, icon: Sparkles, isBoss: false },
    { name: '竜の使徒', hpMultiplier: 6, rewardMultiplier: 5, icon: Swords, isBoss: false },
    { name: '竜王', hpMultiplier: 12, rewardMultiplier: 11, icon: Swords, isBoss: true },
    
    // ステージ7-8: 最上級エリア
    { name: '星の守護者', hpMultiplier: 8, rewardMultiplier: 7, icon: Star, isBoss: false },
    { name: '月の騎士', hpMultiplier: 10, rewardMultiplier: 8.5, icon: Moon, isBoss: false },
    { name: '太陽の戦士', hpMultiplier: 12, rewardMultiplier: 10, icon: Sun, isBoss: false },
    { name: '天界の覇王', hpMultiplier: 18, rewardMultiplier: 16, icon: Sun, isBoss: true },
    
    // ステージ9-10: 神級エリア
    { name: '時の守護者', hpMultiplier: 15, rewardMultiplier: 13, icon: CircleDot, isBoss: false },
    { name: '運命の使者', hpMultiplier: 18, rewardMultiplier: 15, icon: Target, isBoss: false },
    { name: '創世の守護者', hpMultiplier: 22, rewardMultiplier: 18, icon: Eye, isBoss: false },
    { name: '神殺しの魔王', hpMultiplier: 30, rewardMultiplier: 25, icon: Crown, isBoss: true },
    
    // ステージ11+: 超越エリア
    { name: '深淵の住人', hpMultiplier: 28, rewardMultiplier: 22, icon: Skull, isBoss: false },
    { name: '虚無の戦士', hpMultiplier: 35, rewardMultiplier: 27, icon: Eye, isBoss: false },
    { name: '終焉の騎士', hpMultiplier: 45, rewardMultiplier: 35, icon: Zap, isBoss: false },
    { name: '絶対神', hpMultiplier: 60, rewardMultiplier: 50, icon: Heart, isBoss: true },
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
    const baseHp = Math.pow(stage, 3) * 50
    const baseReward = Math.pow(stage, 2.5) * 50
    const hp = baseHp * template.hpMultiplier
    
    return {
      name: `${template.name}`,
      hp,
      maxHp: hp,
      isBoss: template.isBoss,
      reward: baseReward * template.rewardMultiplier * goldMultiplier,
      icon: template.icon,
      stage
    }
  }, [goldMultiplier])

  const getCurrentLevel = useCallback(() => Math.floor(enemyKills / 10) + 1, [enemyKills])

  const getCurrentStage = useCallback(() => Math.floor(enemyKills / 10) + 1, [enemyKills])

  useEffect(() => {
    setCurrentEnemy(generateEnemy(0))
  }, [generateEnemy])

  // 仲間の自動攻撃（武器の攻撃力ベース）
  useEffect(() => {
    const weapon = getCurrentWeapon()
    
    const interval = setInterval(() => {
      if (!weapon || !currentEnemy) return
      
      const ownedCompanions = companions.filter(c => c.owned)
      if (ownedCompanions.length === 0) return
      
      const totalMultiplier = ownedCompanions.reduce((sum, c) => sum + c.damageMultiplier, 0)
      const damage = (weapon.damage * totalMultiplier * damageBuff) / (10 / attackSpeedBuff)
      const newHp = currentEnemy.hp - damage

      if (newHp <= 0) {
        const reward = currentEnemy.reward
        setGold(prev => prev + reward)
        setEnemyKills(prev => prev + 1)

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
  }, [companions, currentEnemy, enemyKills, generateEnemy, attackSpeedBuff, damageBuff, weapons])

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

  const attack = (multiplier = 1) => {
    if (!currentEnemy) return

    const weapon = getCurrentWeapon()
    if (!weapon) return

    const isCritical = Math.random() < 0.15
    const critMultiplier = isCritical ? 2.5 : 1
    const damage = weapon.damage * multiplier * critMultiplier

    addDamagePopup(damage, isCritical)

    const newHp = currentEnemy.hp - damage

    if (newHp <= 0) {
      const reward = currentEnemy.reward
      setGold(prev => prev + reward)
      setEnemyKills(prev => prev + 1)

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
    if (skill && skill.owned && !skillCooldowns[skillId] && currentEnemy) {
      setSkillCooldowns(prev => ({ ...prev, [skillId]: true }))
      
      if (skill.type === 'instant_kill') {
        // 即死スキル
        const killCount = skill.effectValue
        for (let i = 0; i < killCount; i++) {
          setTimeout(() => {
            if (currentEnemy) {
              setGold(prev => prev + currentEnemy.reward)
              setEnemyKills(prev => prev + 1)
              setCurrentEnemy(generateEnemy(enemyKills + i + 1))
            }
          }, i * 200)
        }
        setTimeout(() => {
          setSkillCooldowns(prev => ({ ...prev, [skillId]: false }))
        }, 5000)
      } else if (skill.type === 'damage_buff') {
        // ダメージバフ
        setDamageBuff(skill.effectValue)
        setTimeout(() => {
          setDamageBuff(1)
          setSkillCooldowns(prev => ({ ...prev, [skillId]: false }))
        }, 30000)
      } else if (skill.type === 'attack_speed') {
        // 攻撃速度バフ
        setAttackSpeedBuff(skill.effectValue)
        setTimeout(() => {
          setAttackSpeedBuff(1)
          setSkillCooldowns(prev => ({ ...prev, [skillId]: false }))
        }, 30000)
      } else if (skill.type === 'gold_buff') {
        // ゴールドバフ
        setGoldMultiplier(prev => prev * skill.effectValue)
        setTimeout(() => {
          setGoldMultiplier(prev => prev / skill.effectValue)
          setSkillCooldowns(prev => ({ ...prev, [skillId]: false }))
        }, 60000)
      }
    }
  }

  const getTotalDPS = () => {
    const weapon = getCurrentWeapon()
    if (!weapon) return 0
    return companions.filter(c => c.owned).reduce((sum, c) => sum + weapon.damage * c.damageMultiplier * damageBuff, 0) / 10
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
      if (stage <= 2) return '/boss-stage1.jpg'
      if (stage <= 4) return '/boss-stage3.jpg'
      if (stage <= 6) return '/boss-stage5.jpg'
      if (stage <= 8) return '/boss-stage7.jpg'
      if (stage <= 10) return '/boss-stage9.jpg'
      return '/boss-stage11.jpg'
    } else {
      if (stage <= 2) return '/enemy-stage1.jpg'
      if (stage <= 4) return '/enemy-stage3.jpg'
      if (stage <= 6) return '/enemy-stage5.jpg'
      if (stage <= 8) return '/enemy-stage7.jpg'
      if (stage <= 10) return '/enemy-stage9.jpg'
      return '/enemy-stage11.jpg'
    }
  }

  const getBackgroundImage = (stage: number): string => {
    if (stage <= 2) return '/bg-stage1.jpg'
    if (stage <= 4) return '/bg-stage3.jpg'
    if (stage <= 6) return '/bg-stage5.jpg'
    if (stage <= 8) return '/bg-stage7.jpg'
    if (stage <= 10) return '/bg-stage9.jpg'
    return '/bg-stage11.jpg'
  }

  useEffect(() => {
    const stage = getCurrentStage()
    if (stage >= 3 && goldMultiplier === 1) setGoldMultiplier(1.5)
    if (stage >= 5 && goldMultiplier < 2) setGoldMultiplier(2)
    if (stage >= 8 && goldMultiplier < 3) setGoldMultiplier(3)
    if (stage >= 12 && goldMultiplier < 5) setGoldMultiplier(5)
  }, [enemyKills, goldMultiplier, getCurrentStage])

  const getNextUnlock = () => {
    const stage = getCurrentStage()
    if (stage < 3) return { stage: 3, reward: 'ゴールド獲得 x1.5', area: '煉獄の谷' }
    if (stage < 5) return { stage: 5, reward: 'ゴールド獲得 x2', area: '黄金の城' }
    if (stage < 8) return { stage: 8, reward: 'ゴールド獲得 x3', area: '天界の塔' }
    if (stage < 12) return { stage: 12, reward: 'ゴールド獲得 x5', area: '深淵の果て' }
    return null
  }

  const hpPercentage = currentEnemy ? (currentEnemy.hp / currentEnemy.maxHp) * 100 : 0

  const handleBuySkill = (skillId: number) => {
    buySkill(skillId)
  }

  const handleUseSkill = (skillId: number) => {
    useSkill(skillId)
  }

  return (
    <div className="min-h-screen text-foreground p-4 flex flex-col items-center justify-center relative overflow-hidden">
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
          return null
        })()}
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black" />
        <div className="absolute inset-0 bg-black/60" />
      </div>
      <div className="absolute inset-0 opacity-10">
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

      <div className="max-w-7xl w-full space-y-6 relative z-10">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-balance bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-400 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]">
            Endless Raid
          </h1>
          <p className="text-sm text-muted-foreground">冒険者の限界突破</p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-4 bg-zinc-900/90 border-zinc-800 backdrop-blur-sm">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="space-y-1">
                <p className="text-muted-foreground">保有ゴールド</p>
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

          <Card className="p-4 bg-zinc-900/90 border-zinc-800 backdrop-blur-sm">
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

        <Card className="p-8 bg-zinc-900/90 border-zinc-800 backdrop-blur-sm relative overflow-hidden min-h-[300px]">
          {currentEnemy && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-4">
                <motion.div
                  animate={{
                    scale: currentEnemy.isBoss ? [1, 1.05, 1] : [1, 1.02, 1],
                    y: currentEnemy.isBoss ? [0, -5, 0] : [0, -3, 0],
                  }}
                  transition={{ duration: currentEnemy.isBoss ? 2 : 3, repeat: Infinity, ease: "easeInOut" }}
                  className="relative"
                >
                  <div className={`relative rounded-2xl overflow-hidden flex items-center justify-center ${
                    currentEnemy.isBoss 
                      ? 'w-48 h-48 border-4 border-amber-500/50 shadow-[0_0_50px_rgba(251,191,36,0.5)] bg-gradient-to-br from-red-900/50 to-zinc-900/50' 
                      : 'w-40 h-40 border-2 border-zinc-700 shadow-[0_0_20px_rgba(0,0,0,0.5)] bg-gradient-to-br from-zinc-800/50 to-zinc-900/50'
                  }`}>
                    {(() => {
                      const imageSrc = getEnemyImage(currentEnemy.stage, currentEnemy.isBoss)
                      const imageExists = imageSrc && imageSrc !== '/placeholder.svg'
                      if (imageExists) {
                        return (
                          <img 
                            src={imageSrc}
                            alt={currentEnemy.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // 画像読み込みエラー時はアイコンを表示
                              e.currentTarget.style.display = 'none'
                            }}
                          />
                        )
                      }
                      return (
                        <div className="flex items-center justify-center w-full h-full">
                          <currentEnemy.icon className={`${currentEnemy.isBoss ? 'w-24 h-24' : 'w-20 h-20'} text-amber-400`} />
                        </div>
                      )
                    })()}
                    {currentEnemy.isBoss && (
                      <div className="absolute inset-0 bg-gradient-to-t from-amber-500/20 via-transparent to-transparent animate-pulse" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  </div>
                </motion.div>
                
                <div className="text-center">
                  <h2 className={`text-2xl font-bold ${currentEnemy.isBoss ? 'text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]' : 'text-foreground'}`}>
                    {currentEnemy.name}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    報酬: {formatNumber(currentEnemy.reward)} ゴールド
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">HP</span>
                  <span className="font-bold">
                    {formatNumber(currentEnemy.hp)} / {formatNumber(currentEnemy.maxHp)}
                  </span>
                </div>
                <Progress
                  value={hpPercentage}
                  className={`h-4 ${currentEnemy.isBoss ? 'bg-zinc-800 [&>div]:bg-gradient-to-r [&>div]:from-red-600 [&>div]:to-amber-500' : 'bg-zinc-800'}`}
                />
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
                      className={`absolute top-1/2 left-1/2 font-bold ${popup.isCritical ? 'text-3xl text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.8)]' : 'text-xl text-foreground'}`}
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
                  className="w-full h-20 text-xl font-bold bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-zinc-950 shadow-[0_0_20px_rgba(251,191,36,0.4)] border-2 border-amber-400"
                >
                  <Sword className="w-6 h-6 mr-2" />
                  攻撃
                </Button>
              </motion.div>
              {companions.filter(c => c.owned).length > 0 && (
                <div className="text-center p-2 bg-zinc-800/50 rounded-lg mt-2">
                  <p className="text-xs text-amber-400">
                    自動攻撃: x{attackSpeedBuff} | ダメージバフ: x{damageBuff}
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-4 bg-zinc-900/90 border-zinc-800 backdrop-blur-sm">
            <h3 className="text-lg font-bold mb-3 text-amber-400">武器</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {weapons.map(weapon => (
                <div key={weapon.id}>
                  {weapon.owned ? (
                    <div className="w-full bg-zinc-800 text-foreground border border-amber-600/50 p-2 rounded flex items-center gap-2">
                      <weapon.icon className="w-4 h-4 text-amber-400" />
                      <span className="text-sm font-bold flex-1">{weapon.name}</span>
                      <span className="text-xs text-amber-400">{formatNumber(weapon.damage)}</span>
                    </div>
                  ) : (
                    <Button
                      onClick={() => buyWeapon(weapon.id)}
                      disabled={gold < weapon.cost}
                      variant="outline"
                      className="w-full border-zinc-700 text-muted-foreground hover:text-amber-400 justify-start"
                      size="sm"
                    >
                      <weapon.icon className="w-4 h-4 mr-2" />
                      <span className="flex-1 text-left text-xs">{weapon.name}</span>
                      <span className="text-xs">{formatNumber(weapon.cost)}</span>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4 bg-zinc-900/90 border-zinc-800 backdrop-blur-sm">
            <h3 className="text-lg font-bold mb-3 text-amber-400">仲間（武器の攻撃力×倍率）</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {companions.map(companion => {
                const weapon = getCurrentWeapon()
                const actualDPS = weapon ? weapon.damage * companion.damageMultiplier * damageBuff : 0
                return (
                  <div key={companion.id}>
                    {companion.owned ? (
                      <div className="w-full bg-zinc-800 text-foreground border border-amber-600/50 p-2 rounded">
                        <div className="flex items-center gap-2">
                          <companion.icon className="w-4 h-4 text-amber-400" />
                          <span className="text-sm font-bold flex-1">{companion.name}</span>
                          <span className="text-xs text-amber-400">x{companion.damageMultiplier}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          DPS: {formatNumber(actualDPS / 10)}/秒
                        </div>
                      </div>
                    ) : (
                      <Button
                        onClick={() => buyCompanion(companion.id)}
                        disabled={gold < companion.cost}
                        variant="outline"
                        className="w-full border-zinc-700 text-muted-foreground hover:text-amber-400 justify-start"
                        size="sm"
                      >
                        <companion.icon className="w-4 h-4 mr-2" />
                        <span className="flex-1 text-left text-xs">{companion.name} (x{companion.damageMultiplier})</span>
                        <span className="text-xs">{formatNumber(companion.cost)}</span>
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>

          <Card className="p-4 bg-zinc-900/90 border-zinc-800 backdrop-blur-sm">
            <h3 className="text-lg font-bold mb-3 text-amber-400">スキル</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {skills.map(skill => (
                <div key={skill.id}>
                  {skill.owned ? (
                    <Button
                      onClick={() => useSkill(skill.id)}
                      disabled={skillCooldowns[skill.id]}
                      className="w-full bg-gradient-to-r from-amber-800 to-amber-700 hover:from-amber-700 hover:to-amber-600 text-foreground flex flex-col items-start h-auto py-2"
                      size="sm"
                    >
                      <div className="flex items-center gap-2 w-full">
                        <skill.icon className="w-4 h-4" />
                        <span className="flex-1 text-left text-xs font-bold">{skill.name}</span>
                        {skillCooldowns[skill.id] && <span className="text-xs">待機中</span>}
                      </div>
                      <p className="text-xs text-amber-200 mt-1 w-full text-left">{skill.description}</p>
                    </Button>
                  ) : (
                    <Button
                      onClick={() => buySkill(skill.id)}
                      disabled={gold < skill.cost}
                      variant="outline"
                      className="w-full border-zinc-700 text-muted-foreground hover:text-amber-400 flex flex-col items-start h-auto py-2"
                      size="sm"
                    >
                      <div className="flex items-center gap-2 w-full">
                        <skill.icon className="w-4 h-4" />
                        <span className="flex-1 text-left text-xs">{skill.name}</span>
                        <span className="text-xs">{formatNumber(skill.cost)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 w-full text-left">{skill.description}</p>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
