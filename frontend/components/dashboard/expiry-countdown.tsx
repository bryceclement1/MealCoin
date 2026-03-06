'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function getNextSaturdayMidnight(): Date {
  const now = new Date()
  const day = now.getDay() // 0=Sun, 6=Sat
  const daysUntilSaturday = (6 - day + 7) % 7 || 7
  const saturday = new Date(now)
  saturday.setDate(now.getDate() + daysUntilSaturday)
  saturday.setHours(23, 59, 59, 0)
  return saturday
}

function formatCountdown(ms: number) {
  if (ms <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }
  const totalSeconds = Math.floor(ms / 1000)
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  }
}

export function ExpiryCountdown() {
  const [msLeft, setMsLeft] = useState<number | null>(null)

  useEffect(() => {
    function tick() {
      setMsLeft(getNextSaturdayMidnight().getTime() - Date.now())
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  if (msLeft === null) return null

  const { days, hours, minutes, seconds } = formatCountdown(msLeft)
  const isUrgent = msLeft < 24 * 60 * 60 * 1000

  return (
    <Card className={isUrgent ? 'border-destructive' : ''}>
      <CardHeader>
        <CardTitle className={isUrgent ? 'text-destructive' : ''}>
          Swipes expire in
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 tabular-nums">
          {[
            { value: days, label: 'days' },
            { value: hours, label: 'hrs' },
            { value: minutes, label: 'min' },
            { value: seconds, label: 'sec' },
          ].map(({ value, label }) => (
            <div key={label} className="flex flex-col items-center">
              <span className={`text-3xl font-bold ${isUrgent ? 'text-destructive' : ''}`}>
                {String(value).padStart(2, '0')}
              </span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
