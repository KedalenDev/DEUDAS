'use client'
import { debts } from '@/config/schema'
import React from 'react'
import { z } from 'zod'
import Input from './Input'
import { nanoid } from 'nanoid'
import { DateTime } from 'luxon'
function extractNextPaymentDay(first_pay: Date) {

    const current = new Date()
    //Set the month of the first payment to the current month
    const next = new Date(first_pay)
    next.setMonth(current.getMonth())
    //If next is less than current, set the month to the next month
    if (next < current) {
        next.setMonth(next.getMonth() + 1)
    }
    //Return the next as an ISO string
    return next.toISOString()
}
const partial = z.object({
    description: z.string(),
    amount: z.coerce.number().positive(),
    status: z.enum(['PENDING', 'PAID', 'OVERDUE']),
    installments: z.coerce.number().positive(),
}).partial()
const ZOD = z.object({
    description: z.string(),
    amount: z.coerce.number().positive(),
    installment_amount: z.coerce.number().positive(),
    status: z.enum(['PENDING', 'PAID', 'OVERDUE'])
}).superRefine((data, ctx) => {
    //check if description has at least 5 characters
    if (!data.description || data.description.length < 5) {
        console.log('description')
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Description should have at least 5 characters',
            path: ['description']
        })
    }

    //check if amount has a maximum of 2 decimal places
    const amount = data.amount.toString().split('.')
    if (amount.length > 1) {
        if (amount[1].length > 2) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Amount should have a maximum of 2 decimal places',
                path: ['amount']
            })
        }
    }



    return data
})
type Debt = {
    id: string;
    totalAmount: number;
    monthlyAmount: number;
};

type RepaymentStrategy = {
    name: string;
    payInFull: boolean;
    payPartial: boolean;
    partialAmount?: number;
    monthlyReduction: number;
    rationale: string;
};

function getStrategy(debts: Debt[], totalBudget: number): RepaymentStrategy[] {
    // Calculate the efficiency (monthly reduction per euro) of paying off each debt

    const totalAmount = debts.reduce((acc, debt) => acc + debt.totalAmount, 0);

    debts.forEach(debt => {
        (debt as any)['efficiency'] = debt.monthlyAmount / totalAmount
    });

    // Sort debts by efficiency in descending order
    (debts as any).sort((a: any, b: any) => b.efficiency - a.efficiency);

    let remainingBudget = totalBudget;
    const strategies: RepaymentStrategy[] = [];

    debts.forEach(debt => {
        let strategy: RepaymentStrategy = {
            name: debt.id,
            payInFull: false,
            payPartial: false,
            monthlyReduction: (debt as any).efficiency,
            rationale: ""
        };

        if (remainingBudget >= debt.totalAmount) {
            // Can pay in full
            strategy.payInFull = true;
            strategy.rationale = "Optimal monthly reduction achieved by paying in full.";
            remainingBudget -= debt.totalAmount;
        } else {
            // Can only pay partially
            
            if (debt.monthlyAmount === debt.totalAmount) {
                strategy.rationale = "Can't pay partially because the monthly amount is equal to the total amount.";
                strategy.payPartial = true;
                strategy.partialAmount = 0;
            } else {
                strategy.payPartial = true;
                strategy.partialAmount = remainingBudget;
                strategy.rationale = "Partial payment made due to budget constraints.";
                remainingBudget = 0;
            }
        }

        strategies.push(strategy);
    });
    console.log({remainingBudget})

    return strategies.filter(strategy => {
        if (strategy.payPartial) {
            return strategy.partialAmount! > 0
        }

        return true
    })
}
const CURRENCY = {
    name: 'EUR',
    symbol: '€',
    symbol_native: '€',
    decimal_digits: 2,
    rounding: 0,
    convert_table: (value: string) => {
        const n = Number(value).toFixed(2)
        return `${CURRENCY.symbol} ${n}`
    }
}
type Props = {
    data: typeof debts.$inferSelect[],
    headers: {
        key: keyof typeof debts.$inferSelect,
        label: string,
        treatment?: ((value: any) => (string | React.ReactElement)) | 'currency' | 'integer' | 'date'
    }[],
    create: (value: typeof debts.$inferInsert) => Promise<void>
    remove: (id: string) => Promise<void>
    update: (id: string, data: Partial<typeof debts.$inferInsert>) => Promise<void>
}

function currency(value: any) {
    return CURRENCY.convert_table(value)
}

function integer(value: any) {
    return Number(value).toFixed(0)
}

function convertIssues(issues: z.ZodIssue[]) {
    return issues.map(issue => {
        return {
            message: issue.message,
            path: issue.path
        }
    })
}

function treatValue(value: any, treatment?: ((value: any) => (string | React.ReactElement)) | 'currency' | 'integer' | 'date') {
    if (treatment) {
        if (typeof treatment === 'string') {
            if (treatment === 'currency') {
                return currency(value)
            } else if (treatment === 'integer') {
                return integer(value)
            } else if (treatment === 'date') {
                const date = DateTime.fromISO(value).toJSDate();
                const next = extractNextPaymentDay(date)

                return date.toISOString().split('T')[0].split('-').reverse().join('/')
            }
        } else {
            return treatment(value)
        }
    }
    return value
}

function Table({ data, headers, create, remove, update }: Props) {
    const [inMemoryData, setInMemoryData] = React.useState<typeof debts.$inferSelect[]>(data)
    const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc')
    const [creating, setCreate] = React.useState(false)
    const [editing, setEdit] = React.useState<string | null>(null)
    const [issues, setIssues] = React.useState<z.ZodIssue[]>([])
    const [strategyResult, setStrategyResult] = React.useState<string[]>([])
    React.useEffect(() => {
        setInMemoryData(data)
    }, [data])

    function onSort(key: keyof typeof debts.$inferSelect) {
        const newData = inMemoryData.sort((a: any, b: any) => {
            if (sortDirection === 'asc') {
                if (a[key] > b[key]) {
                    return 1
                }
                if (a[key] < b[key]) {
                    return -1
                }
                return 0
            } else {
                if (a[key] < b[key]) {
                    return 1
                }
                if (a[key] > b[key]) {
                    return -1
                }
                return 0
            }
        })
        setInMemoryData([...newData])
        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    }

    function search(key: keyof typeof debts.$inferSelect, value: string) {
        const vv = value.toLowerCase()
        const newData = data.filter((row: any) => {
            if (row[key].toString().toLowerCase().includes(vv)) {
                return true
            }
            return false
        })
        setInMemoryData(newData)
    }

    function filter(key: keyof typeof debts.$inferSelect, value: string) {
        const newData = data.filter((row: any) => {
            if (value === 'all') {
                return true
            }
            if (row[key] === value.toUpperCase()) {
                return true
            }
            return false
        })
        setInMemoryData(newData)
    }


    return (
        <div>
            <CreateDialog
                show={creating}
                create={create} issues={issues} setIssues={setIssues} setCreate={setCreate} />
            <EditDialog
                show={!!editing}
                current={inMemoryData.find(row => row.id === editing)!}
                edit={update}
                issues={issues} setIssues={setIssues} setEdit={x => setEdit(null)} />
            <div>
                <button
                    onClick={() => setCreate(true)}
                    className="w-full p-2 mb-4 bg-indigo-600 text-white">Create</button>
                <button
                    onClick={async () => {
                        const promptRes = prompt('Enter the amount to pay')
                        if (!promptRes) return
                        const amountZod = z.coerce.number();
                        const result = amountZod.safeParse(promptRes)
                        if (!result.success) {
                            alert(result.error.issues[0].message)
                            return
                        }
                        const debtsMappedToDebt = inMemoryData.map(x => ({
                            id: x.id,
                            monthlyAmount: Number(x.installment_amount),
                            totalAmount: Number(x.amount)
                        } as Debt));

                        const strategy = getStrategy(debtsMappedToDebt, result.data);

                        for (const item of strategy) {
                            const debt = inMemoryData.find(x => x.id === item.name)
                            if (!debt) continue;
                            //now update the debt inmemory not in db and display the result
                            const currentAmount = Number(debt.amount)
                            const amount = item.payPartial ? currentAmount - item.partialAmount! : 0
                            const quotaAmountXUnit = Number(debt.installment_amount) / currentAmount;
                            const installment_amount = item.payPartial ? (item.partialAmount! * quotaAmountXUnit) : 0
               
                            setInMemoryData(pr => {
                                return pr.map(x => {
                                    if (x.id === item.name) {
                                        return {
                                            ...x,
                                            status: item.payInFull ? 'PAID' : 'PENDING',
                                            amount: amount.toFixed(2),
                                            installment_amount: installment_amount!.toFixed(2)
                                        }
                                    }
                                    return x
                                })

                            })
                            setStrategyResult(pr => {
                                return [
                                    ...pr,
                                    item.name
                                ]
                            })
                        }

                    }}
                    className="w-full p-2 mb-4 bg-green-600 text-white">Calculate Best Strategy</button>
                <input type="text" onChange={(e) => search('description', e.target.value)} className="w-full p-2 mb-4 dark:bg-gray-900 dark:text-white" placeholder="Search" />
                <div className='flex flex-row'>
                    <select
                        onChange={(e) => filter('status', e.target.value)}
                        className="w-full p-2 mb-4 dark:bg-gray-900 dark:text-white" name="status" id="status">
                        <option value="all">All</option>
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="overdue">Overdue</option>
                    </select>
                </div>
            </div>
            <div className='w-full max-h-[720px]  overflow-y-scroll'>
                <table className="w-full  mx-auto  dark:divide-gray-700 dark:bg-gray-900 rounded-md shadow-md border border-gray-700">
                    <thead className="text-left rtl:text-right">
                        <tr>
                            {headers.map((header, index) => (
                                <th
                                    onClick={() => onSort(header.key)}
                                    key={index} className={`
                                    sticky inset-y-0 start-0 top-[-5px]
                                    bg-gray-100 dark:bg-gray-800
                                    whitespace-nowrap px-4 py-2 font-medium text-gray-900 dark:text-white
                                    ${header.key === 'id' ? 'hidden' : ''}
                                    `}>{header.label}</th>
                            ))}
                            <th

                                key={'ACTIONS_HEADER'} className={`
                                    sticky inset-y-0 start-0 top-[-5px]
                                    bg-gray-100 dark:bg-gray-800
                                    whitespace-nowrap px-4 py-2 font-medium text-gray-900 dark:text-white
                                    `}>Actions</th>
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {
                            inMemoryData.map((row: typeof debts.$inferSelect, index) => {
                                return (
                                    <tr key={index} className={
                                        strategyResult.includes(row.id) ?
                                            'bg-yellow-100 dark:bg-yellow-800' :
                                            row.status === 'PAID' ?
                                                'bg-green-100 dark:bg-green-800' :
                                                row.status === 'OVERDUE' ?
                                                    'bg-red-100 dark:bg-red-800' :
                                                    'bg-white dark:bg-gray-900'
                                    }>
                                        {
                                            headers.map((header, index) => (
                                                <td key={index} className={`whitespace-nowrap px-4 py-2 text-gray-900 dark:text-white
                                                ${header.key === 'id' ? 'hidden' : ''}
                                                `}>{
                                                        treatValue(row[header.key], header.treatment)
                                                    }</td>
                                            ))
                                        }

                                        <td className="whitespace-nowrap px-4 py-2 grid grid-cols-4 gap-2">
                                            {row.status !== 'PAID' && <button
                                                onClick={async e => {
                                                    e.preventDefault()
                                                    await update(row.id, {
                                                        status: 'PAID',
                                                    })
                                                }}
                                                className="p-2 bg-green-600 text-white rounded-sm"
                                            >Pay</button>}

                                            {row.status !== 'PAID' && <button
                                                onClick={async e => {
                                                    const amountPrompt = prompt('Enter the amount to pay')
                                                    if (!amountPrompt) return
                                                    const currentAmount = Number(row.amount)
                                                    const amountZod = z.coerce.number().refine(value => value <= currentAmount, {
                                                        message: 'The amount should be less than the total'
                                                    })
                                                    const result = amountZod.safeParse(amountPrompt)
                                                    if (!result.success) {
                                                        alert(result.error.issues[0].message)
                                                        return
                                                    }

                                                    if (Number(row.installments) > 1) {
                                                        const newQuotaPrompt = prompt('Enter the new quota')
                                                        if (!newQuotaPrompt) return
                                                        const newQuotaZod = z.coerce.number().refine(value => value <= result.data, {
                                                            message: 'The new quota should be less than the total'
                                                        })
                                                        const resultQuota = newQuotaZod.safeParse(newQuotaPrompt)
                                                        if (!resultQuota.success) {
                                                            alert(resultQuota.error.issues[0].message)
                                                            return
                                                        }
                                                        await update(row.id, {
                                                            status: 'PENDING',
                                                            amount: (currentAmount - result.data).toFixed(2),
                                                            installment_amount: resultQuota.data.toFixed(2)
                                                        })
                                                        return
                                                    }

                                                    await update(row.id, {
                                                        status: 'PENDING',
                                                        amount: (currentAmount - result.data).toFixed(2),
                                                        installment_amount: (currentAmount - result.data).toFixed(2),
                                                    })


                                                }}
                                                className="p-2 bg-yellow-600 text-white rounded-sm"
                                            >Partial Pay</button>}

                                            <button
                                                onClick={() => setEdit(row.id)}
                                                className="p-2 bg-indigo-600 text-white rounded-sm"
                                            >Edit</button>
                                            <button
                                                onClick={() => remove(row.id)}
                                                className="p-2 bg-red-600 text-white rounded-sm"
                                            >Delete</button>
                                        </td>

                                    </tr>
                                )
                            })
                        }
                    </tbody>
                    <tfoot >
                        <tr className='bg-gray-800 dark:bg-gray-900 '>
                            <td />
                            <td className=" text-white p-2 border-l border-r border-gray-700">
                                <p>Total: {
                                    CURRENCY.convert_table(inMemoryData.reduce((acc, row) => {
                                        return acc + Number(row.amount)
                                    }, 0).toFixed(2))
                                }
                                </p>
                            </td>
                            <td />
                            <td className=" text-white p-2 border-l border-r border-gray-700">
                                <p>Total: {
                                    CURRENCY.convert_table(inMemoryData.filter(x => Number(x.installments) > 1).reduce((acc, row) => {
                                        return acc + Number(row.installment_amount)
                                    }, 0).toFixed(2))
                                }
                                </p>
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <div className="flex justify-end mt-4">
                <p className="text-gray-900 dark:text-white">Showing {inMemoryData.length} of {data.length}</p>
            </div>
        </div>
    )
}


function CreateDialog({ create, issues, setIssues, setCreate, show }: {
    create: (value: typeof debts.$inferInsert) => Promise<void>
    issues: z.ZodIssue[],
    setIssues: (value: z.ZodIssue[]) => void,
    setCreate: (value: boolean) => void,
    show: boolean
}) {
    if (!show) return null
    return (
        <div className='fixed top-0 right-0 z-10  w-screen h-screen grid place-items-center
        backdrop-filter backdrop-blur-md dark:bg-black dark:bg-opacity-60 dark:text-white
        '>
            <div className='mx-auto max-w-3xl w-full bg-black p-4 rounded-md'>
                <form onSubmit={async e => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const formValues = Object.fromEntries(formData.entries());
                    const result = ZOD.safeParse(formValues)
                    if (!result.success) {
                        setIssues(result.error.issues)
                        console.log(result.error.issues)
                        return
                    }
                    setIssues([])
                    const installment_amount = Number(result.data.installment_amount)


                    const installments = Number(result.data.amount) / installment_amount

                    await create({
                        id: nanoid(),
                        description: result.data.description,
                        status: result.data.status,
                        amount: result.data.amount.toFixed(2),
                        installments: installments.toFixed(0),
                        installment_amount: installment_amount.toFixed(2),
                    })
                    setCreate(false)

                }}>
                    <Input issue={issues} label="Description" name="description" />
                    <Input issue={issues} label="Amount" name="amount" type='text' />
                    <Input issue={issues} label="Quota" name="installment_amount" type='text' />
                    <select className="w-full p-2 mb-4 dark:bg-gray-900 dark:text-white" name="status" id="status">
                        <option value="PENDING">PENDING</option>
                        <option value="PAID">PAID</option>
                        <option value="OVERDUE">OVERDUE</option>
                    </select>
                    <button className="w-full p-2 mb-4 bg-indigo-600 text-white">Create</button>


                </form>
                <button
                    onClick={() => setCreate(false)}
                    className="w-full p-2 mb-4 bg-red-600 text-white">Cancel</button>
            </div>
        </div>
    )
}

function EditDialog({ edit, issues, setIssues, setEdit, show, current }: {
    edit: (id: string,
        data: Partial<typeof debts.$inferInsert>
    ) => Promise<void>
    issues: z.ZodIssue[],
    setIssues: (value: z.ZodIssue[]) => void,
    setEdit: (value: boolean) => void,
    show: boolean,
    current: typeof debts.$inferSelect
}) {
    if (!show) return null
    return (
        <div className='fixed top-0 right-0 z-10  w-screen h-screen grid place-items-center
            backdrop-filter backdrop-blur-md dark:bg-black dark:bg-opacity-60 dark:text-white
            '>
            <div className='mx-auto max-w-3xl w-full bg-black p-4 rounded-md'>
                <form onSubmit={async e => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const formValues = Object.fromEntries(formData.entries());
                    const result = partial.safeParse({
                        ...current,
                        ...formValues,
                    })
                    if (!result.success) {
                        setIssues(result.error.issues)
                        console.log(result.error.issues)
                        return
                    }
                    setIssues([])


                    await edit(current.id, formValues)
                    setEdit(false)

                }}>
                    <Input issue={issues}
                        defaultValue={current.description}
                        label="Description" name="description" />
                    <Input issue={issues}
                        defaultValue={current.amount}
                        label="Amount" name="amount" type='text' />
                    <Input issue={issues}
                        defaultValue={current.installments}
                        label="Installments" name="installments" type='number' />
                    <select
                        defaultValue={current.status}
                        className="w-full p-2 mb-4 dark:bg-gray-900 dark:text-white" name="status" id="status">
                        <option value="PENDING">PENDING</option>
                        <option value="PAID">PAID</option>
                        <option value="OVERDUE">OVERDUE</option>
                    </select>
                    <button className="w-full p-2 mb-4 bg-indigo-600 text-white">OK</button>


                </form>
                <button
                    onClick={() => setEdit(false)}
                    className="w-full p-2 mb-4 bg-red-600 text-white">Cancel</button>
            </div>
        </div>
    )
}

export default Table