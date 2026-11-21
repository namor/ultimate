import type { ReactNode } from 'react'
import { definePoint } from '@/sdk'
import type { Message } from './refs.ts'

export const MessageAnswers = definePoint<Message, ReactNode>('messages.answers')

export const MessageExtras = definePoint<Message, ReactNode>('messages.extras')
