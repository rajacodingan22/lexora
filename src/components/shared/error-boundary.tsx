'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <Card className="m-4 border-destructive/50">
          <CardContent className="p-6 text-center">
            <h3 className="font-semibold text-destructive">Terjadi kesalahan</h3>
            <p className="mt-1 text-sm text-muted">{this.state.error?.message || 'Silakan muat ulang halaman.'}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Coba Lagi
            </Button>
          </CardContent>
        </Card>
      )
    }
    return this.props.children
  }
}
