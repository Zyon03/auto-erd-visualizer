import { db } from '../src/db/client'
import { createSession } from '../src/mutations/sessions'
import { addTable } from '../src/mutations/tables'
import { addField } from '../src/mutations/fields'
import { addRelationship } from '../src/mutations/relationships'

const session = createSession(db, 'Demo')
const users = addTable(db, session.id, 'users')
const orders = addTable(db, session.id, 'orders')
const userId = addField(db, users.id, 'id', 'uuid', true)
addField(db, users.id, 'name', 'text')
const orderUserId = addField(db, orders.id, 'user_id', 'uuid', false, true)
addRelationship(db, session.id, userId.id, orderUserId.id, 'one-to-many', 'A user can place multiple orders, but each order belongs to exactly one user.')

console.log(`Open http://localhost:3000/sessions/${session.id}`)
