/**
 * Dashboard card showing a live countdown to the weekly swipe expiry.
 *
 * Swipes expire every Saturday at 11:59 PM (matching the on-chain burnAll schedule).
 * The countdown updates every second via setInterval. The card border and text
 * turn red when fewer than 24 hours remain to create urgency.
 */

'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Compute the Date of the next Saturday at 11:59:59 PM local time.
 * If today is Saturday, returns next Saturday (not today) so the countdown
 * never shows zero on Saturday morning.
 */
function getNextSaturdayMidnight(): Date {
  const now = new Date()
  const day = now.getDay() // 0=Sun, 6=Sat
  const daysUntilSaturday = (6 - day + 7) % 7 || 7
  const saturday = new Date(now)
  saturday.setDate(now.getDate() + daysUntilSaturday)
  saturday.setHours(23, 59, 59, 0)
  return saturday
}

/**
 * Break a millisecond duration into days, hours, minutes, and seconds.
 * Returns zeroes if the duration is negative (already expired).
 */
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

/**
 * Render the expiry countdown card. Ticks every second. Highlights in red
 * when fewer than 24 hours remain before Saturday midnight.
 */
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
  const isUrgent = msLeft < 24 * 60 * 60 * 1000  // less than 24 hours remaining

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
