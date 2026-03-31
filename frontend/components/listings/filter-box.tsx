'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export type OfferFilters = {
  maxSwipes: number | ''
  maxPrice: string
  sortOrder: 'price_asc' | 'swipes_desc'
}

export const DEFAULT_FILTERS: OfferFilters = {
  maxSwipes: '',
  maxPrice: '',
  sortOrder: 'price_asc',
}

const SWIPE_COUNTS = [1, 2, 3, 4, 5, 6]

interface FilterBoxProps {
  filters: OfferFilters
  onChange: (filters: OfferFilters) => void
}

export function FilterBox({ filters, onChange }: FilterBoxProps) {
  const isActive = filters.maxSwipes !== '' || filters.maxPrice !== ''

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Filter Listings</CardTitle>
          {isActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange({ ...DEFAULT_FILTERS, sortOrder: filters.sortOrder })}
              className="h-auto py-1 px-2 text-xs"
            >
              Clear filters
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="max-swipes" className="text-xs">
            Max Swipes
          </Label>
          <select
            id="max-swipes"
            value={filters.maxSwipes}
            onChange={(e) =>
              onChange({
                ...filters,
                maxSwipes: e.target.value === '' ? '' : Number(e.target.value),
              })
            }
            className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Any</option>
            {SWIPE_COUNTS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="max-price" className="text-xs">
            Max Price / Swipe
          </Label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
              $
            </span>
            <Input
              id="max-price"
              type="number"
              min="0"
              max="12"
              step="0.01"
              placeholder="12.00"
              value={filters.maxPrice}
              onChange={(e) => onChange({ ...filters, maxPrice: e.target.value })}
              className="h-8 text-sm pl-6"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sort-order" className="text-xs">
            Sort By
          </Label>
          <select
            id="sort-order"
            value={filters.sortOrder}
            onChange={(e) =>
              onChange({
                ...filters,
                sortOrder: e.target.value as OfferFilters['sortOrder'],
              })
            }
            className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="price_asc">Cheapest first</option>
            <option value="swipes_desc">Most swipes first</option>
          </select>
        </div>
      </CardContent>
    </Card>
  )
}
