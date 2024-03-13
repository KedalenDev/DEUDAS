import React from 'react'
import { z } from 'zod'

type Props = {
    issue: z.ZodIssue[]
    label: string
    name: string
} & Omit<React.HTMLProps<HTMLInputElement>, 'name'>


const NON_ISSUE = "w-full p-2 mb-4 dark:bg-gray-900 dark:text-white"
const ISSUE = "w-full p-2 mb-4 dark:bg-gray-900 dark:text-white border-red-500"
function Input({issue,label,name, ...props}: Props) {
  const hasSelfIssue = issue.find(i => i.path[0] === name)
  
  return (
    <div className='relative'>
      <label
        className="block text-sm font-medium text-white"
      htmlFor={name}>{label}
      {hasSelfIssue ? <span className="text-red-500"> * ({hasSelfIssue.message})</span> : null}
      </label>
      <input {...props} className={
          hasSelfIssue ? ISSUE : NON_ISSUE
      } id={name} name={name} />
    </div>
  )
}

export default Input