import {sql} from 'drizzle-orm'
import {text, sqliteTable, numeric, } from 'drizzle-orm/sqlite-core'
import { nanoid } from 'nanoid'

export const debts = sqliteTable('debts', {
    id: text("id").primaryKey(),
    description: text("description").notNull(),
    amount: numeric("amount").notNull(),
    installments: numeric("installments").notNull(),
    installment_amount: numeric("installment_amount").notNull(),
    status: text("status").notNull(),
    created_at: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
})


type AmountType = {
    precision: number,
    max: number,
}

function randomAmount(req: AmountType) {
    const amount = Math.random() * req.max;
    return amount.toFixed(req.precision)
}


export function generateRandomDebt() {
    const amount = randomAmount({precision: 2, max: 1000})
    const installments = randomAmount({precision: 0, max: 12})
    const installment_amount = (Number(amount) / Number(installments)).toFixed(2)


    return {
        id: nanoid(),
        description: "Random debt",
        amount,
        installments,
        installment_amount,
        installment_frequency: "monthly",
        status: "PENDING",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }
}