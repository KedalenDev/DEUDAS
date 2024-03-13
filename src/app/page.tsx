
import Image from "next/image";
import { db } from "@/config/db";
import { debts, generateRandomDebt } from "@/config/schema";
import Table from "@/components/Table";
import { arrayContains, eq, gte, inArray, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {z} from 'zod'

const statusToColor = (status: string) => {
  if(status === 'PENDING') {
    return 'bg-yellow-500';
  } else if(status === 'PAID') {
    return 'bg-green-500';
  } else if(status === 'OVERDUE') {
    return 'bg-red-500';
  }
}


type Params = {
  searchParams: Record<string, string>
}

type QueryParams = {
  status?: string[]
  amount?: {
    min?: string;
    max?: string;
  }
}


const queryStringToArray = z.string().transform((v) => {
  return v.split(';')
})

const querySchema = z.object({
  status: queryStringToArray.optional(),
  amount_min: z.coerce.number().transform((v) => v.toString()).optional(),
  amount_max: z.coerce.number().transform((v) => v.toString()).optional(),
}).optional().refine((v) => {
  if(v?.amount_min && v?.amount_max) {
    return v.amount_min < v.amount_max;
  }
  return true;
}).transform((v) => {
  if(!v) return v;
  if(v?.amount_min || v?.amount_max) {
    return {
      status: v.status,
      amount: {
        min: v.amount_min,
        max: v.amount_max
      }
    }
  }
  return {
    status: v.status
  }
})

async function createDebt(debt: typeof debts['$inferInsert']) {
  'use server'
  await db.insert(debts).values(debt).execute();
  revalidatePath('/')
}

async function queryDebts(params?: QueryParams): Promise<Array<typeof debts['$inferSelect']>> {
  'use server'
  if(!params) return await db.select().from(debts).all();
  let query: any = db.select().from(debts)
  if(params?.status) {
    console.log(params.status)
    query = query.where(inArray(debts.status, params.status))
  }
  if(params?.amount?.min) {
    query = query.where(gte(debts.amount, params.amount.min));
  }
  if(params?.amount?.max) {
    query = query.where(lte(debts.amount, params.amount.max));
  }
  return await query.execute();
}

async function removeDebt(id: string) {
  'use server'
  await db.delete(debts).where(eq(debts.id, id)).execute();
  revalidatePath('/')
}

async function recalculateInstallments(id: string) {
  'use server'
  let _debt = await db.select().from(debts).where(eq(debts.id, id)).limit(1).execute();
  if(_debt.length === 0) return;
  const debt = _debt[0];
  const amount = Number(debt.amount);
  const installments = Number(debt.installments);
  if(installments === 0) {
    await db.update(debts).set({installment_amount: amount.toFixed(2)}).where(eq(debts.id, id)).execute();
    return;
  }
  const installment_amount = amount / installments;
  await db.update(debts).set({installment_amount: installment_amount.toFixed(2)}).where(eq(debts.id, id)).execute();
}

async function updateDebt(id: string, data: Partial<typeof debts.$inferInsert>) {
  'use server'


  await db.update(debts).set(data).where(eq(debts.id, id)).execute();
  await recalculateInstallments(id);
  revalidatePath('/')
}

export default async function Home(params: Params) {
  


  let allDebts: Array<typeof debts['$inferSelect']> = await queryDebts();
  
  return (
    <main className="min-h-screen p-24 bg-gray-800">
      <Table 
      data={allDebts}
      headers={[
        {key: "id", label: "ID"},
        {key: "description", label: "Desc"},
        {key: "amount", label: "Amount", treatment: 'currency'},
        {key: 'status', label: "Status"},
        {key: 'installment_amount', label: "Quota", treatment: 'currency'},
        {key: 'installments', label: "Installments", treatment: 'integer'},
      ]}
      create={createDebt}
      remove={removeDebt}
      update={updateDebt}
      />
    </main>
  );
}
