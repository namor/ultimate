import type { JSX } from '@solidjs/web'
import { definePoint } from '@/sdk/types.ts'
import type { Message } from './refs.ts'

export const MessageAnswers = definePoint<{ message: Message }, JSX.Element>('messages.answers')

export const MessageExtras = definePoint<{ message: Message }, JSX.Element>('messages.extras')
