'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Search, UserPlus, Loader2, Ban, CheckCircle, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react'

const ROLES = ['student', 'teacher', 'admin'] as const
const PER_PAGE = 10
const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

interface UserRow {
  id: string
  display_name: string | null
  email: string | null
  role: string
  status: string
  created_at: string
}

export default function AdminUsersPage() {
  const supabase = createClient()
  const { t, lang } = useI18n()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [updating, setUpdating] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', email: '', password: '', role: 'student' })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase.from('users').select('*', { count: 'exact' })

      if (search.trim()) {
        query = query.or('display_name.ilike.%' + search + '%,email.ilike.%' + search + '%')
      }
      if (roleFilter !== 'all') query = query.eq('role', roleFilter)
      if (statusFilter !== 'all') query = query.eq('status', statusFilter)

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(page * PER_PAGE, (page + 1) * PER_PAGE - 1)

      if (!error && data) {
        setUsers(data as UserRow[])
        setTotal(count ?? 0)
      }
    } catch (err) {
      console.error('Failed to fetch users:', err)
      setUsers([])
    }
    setLoading(false)
  }, [search, roleFilter, statusFilter, page])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  useEffect(() => {
    setPage(0)
  }, [search, roleFilter, statusFilter])

  async function updateRole(userId: string, newRole: string) {
    setUpdating(userId)
    setActionError('')
    const { error } = await supabase.from('users').update({ role: newRole }).eq('id', userId)
    if (error) setActionError(t('admin2.users.updateRoleFailed', { message: error.message }))
    setUpdating(null)
    fetchUsers()
  }

  async function toggleStatus(user: UserRow) {
    setUpdating(user.id)
    setActionError('')
    const newStatus = user.status === 'active' ? 'suspended' : 'active'
    const { error } = await supabase.from('users').update({ status: newStatus }).eq('id', user.id)
    if (error) setActionError(t('admin2.users.toggleStatusFailed', { message: error.message }))
    setUpdating(null)
    fetchUsers()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError('')

    const { count } = await supabase
      .from('enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', deleteTarget.id)

if (count && count > 0) {
      setDeleteError(t('admin2.users.cannotDelete', { count }))
      setDeleting(false)
      return
    }

    const { error } = await supabase.from('users').delete().eq('id', deleteTarget.id)
    if (error) {
      setDeleteError(error.message)
      setDeleting(false)
      return
    }
    setDeleteTarget(null)
    setDeleting(false)
    fetchUsers()
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    setAddError('')

    const { data, error } = await supabase.auth.signUp({
      email: addForm.email,
      password: addForm.password,
    })

    if (error) {
      setAddError(error.message)
      setAdding(false)
      return
    }

    if (data.user) {
      const { error: profileError } = await supabase.from('users').insert({
        id: data.user.id,
        display_name: addForm.name,
        email: addForm.email,
        role: addForm.role,
        status: 'active',
      })
      if (profileError) {
        setAddError(profileError.message)
        setAdding(false)
        return
      }
    }

    setShowAddModal(false)
    setAddForm({ name: '', email: '', password: '', role: 'student' })
    setAdding(false)
    fetchUsers()
  }

  const totalPages = Math.ceil(total / PER_PAGE)

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(LOCALE_MAP[lang] || 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  function roleLabel(role: string) {
    switch (role) {
      case 'admin': return t('admin2.users.roleAdmin')
      case 'teacher': return t('admin2.users.roleTeacher')
      case 'student': return t('admin2.users.roleStudent')
      default: return role.charAt(0).toUpperCase() + role.slice(1)
    }
  }

  function statusLabel(status: string) {
    switch (status) {
      case 'active': return t('admin2.users.statusActive')
      case 'pending': return t('admin2.users.statusPending')
      case 'suspended': return t('admin2.users.statusSuspended')
      default: return status.charAt(0).toUpperCase() + status.slice(1)
    }
  }

  function roleBadgeVariant(role: string) {
    switch (role) {
      case 'admin': return 'primary'
      case 'teacher': return 'info'
      case 'student': return 'accent'
      default: return 'ghost'
    }
  }

  function statusBadgeVariant(status: string) {
    switch (status) {
      case 'active': return 'success'
      case 'suspended': return 'destructive'
      case 'pending': return 'warning'
      default: return 'outline'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
<h1 className="text-2xl font-bold text-on-surface">{t('admin2.users.title')}</h1>
          <p className="text-on-surface-variant">{t('admin2.users.subtitle')}</p>
        </div>
        <Button size="sm" onClick={() => setShowAddModal(true)}>
          <UserPlus className="mr-1 h-4 w-4" /> {t('admin2.users.addUser')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
<Input
                placeholder={t('admin2.users.searchPlaceholder')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="w-28">
              <option value="all">{t('admin2.users.allRoles')}</option>
              {ROLES.map(r => (
                <option key={r} value={r}>{roleLabel(r)}</option>
              ))}
            </Select>
            <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-32">
              <option value="all">{t('admin2.users.allStatus')}</option>
              <option value="active">{t('admin2.users.statusActive')}</option>
              <option value="pending">{t('admin2.users.statusPending')}</option>
              <option value="suspended">{t('admin2.users.statusSuspended')}</option>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {actionError && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {actionError}
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> {t('admin2.users.loadingUsers')}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted uppercase">
<th className="pb-3 font-medium">{t('admin2.users.colName')}</th>
                      <th className="pb-3 font-medium">{t('admin2.users.colEmail')}</th>
                      <th className="pb-3 font-medium">{t('admin2.users.colRole')}</th>
                      <th className="pb-3 font-medium">{t('admin2.users.colStatus')}</th>
                      <th className="pb-3 font-medium">{t('admin2.users.colCreated')}</th>
                      <th className="pb-3 font-medium">{t('admin2.users.colActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-muted">
{search || roleFilter !== 'all' || statusFilter !== 'all'
                            ? t('admin2.users.noMatch')
                            : t('admin2.users.noUsers')}
                        </td>
                      </tr>
                    ) : (
                      users.map(u => (
                        <tr key={u.id} className="border-b border-border hover:bg-surface/50">
                          <td className="py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-xs font-bold text-white shrink-0">
                                {u.display_name?.[0]?.toUpperCase() || 'U'}
                              </div>
                              <p className="font-medium text-on-surface">{u.display_name || t('admin2.users.unnamed')}</p>
                            </div>
                          </td>
                          <td className="py-3 text-on-surface-variant">{u.email}</td>
                          <td className="py-3">
                            <Badge variant={roleBadgeVariant(u.role)} size="sm">{roleLabel(u.role)}</Badge>
                          </td>
                          <td className="py-3">
                            <Badge variant={statusBadgeVariant(u.status)} size="sm">{statusLabel(u.status)}</Badge>
                          </td>
                          <td className="py-3 text-on-surface-variant text-xs">
                            {u.created_at ? formatDate(u.created_at) : '-'}
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-1">
                              <Select
                                value={u.role}
                                onChange={e => updateRole(u.id, e.target.value)}
                                disabled={updating === u.id}
                              >
{ROLES.map(r => (
                                  <option key={r} value={r}>{roleLabel(r)}</option>
                                ))}
                              </Select>
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => toggleStatus(u)}
                                disabled={updating === u.id}
                                title={u.status === 'active' ? t('admin2.users.suspend') : t('admin2.users.activate')}
                              >
                                {u.status === 'active'
                                  ? <Ban className="h-4 w-4 text-amber-400" />
                                  : <CheckCircle className="h-4 w-4 text-emerald-400" />
                                }
                              </Button>
<Button
                                variant="ghost" size="sm"
                                onClick={() => setDeleteTarget(u)}
                                title={t('admin2.users.deleteUser')}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

{totalPages > 1 && (
                <div className="flex flex-col items-center justify-between gap-3 pt-4 sm:flex-row">
                  <p className="text-xs text-muted">
                    {t('admin2.users.showing', { start: page * PER_PAGE + 1, end: Math.min((page + 1) * PER_PAGE, total), total })}
                  </p>
                  <div className="flex items-center gap-1 overflow-x-auto">
                    <Button
                      variant="ghost" size="sm"
                      disabled={page === 0}
                      onClick={() => setPage(p => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => (
                      <Button
                        key={i}
                        variant={i === page ? 'default' : 'ghost'}
                        size="sm"
                        className="w-8"
                        onClick={() => setPage(i)}
                      >
                        {i + 1}
                      </Button>
                    ))}
                    <Button
                      variant="ghost" size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage(p => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-on-surface">{t('admin2.users.addModalTitle')}</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowAddModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <Label htmlFor="add-name">{t('admin2.users.fullName')}</Label>
                <Input id="add-name" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div>
                <Label htmlFor="add-email">{t('admin2.users.email')}</Label>
                <Input id="add-email" type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} required />
              </div>
              <div>
                <Label htmlFor="add-password">{t('admin2.users.password')}</Label>
                <Input id="add-password" type="password" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} required minLength={6} />
              </div>
              <div>
<Label htmlFor="add-role">{t('admin2.users.role')}</Label>
                <Select id="add-role" value={addForm.role} onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}>
                  {ROLES.map(r => (
                    <option key={r} value={r}>{roleLabel(r)}</option>
                  ))}
                </Select>
              </div>
              {addError && <p className="text-xs text-destructive">{addError}</p>}
              <div className="flex justify-end gap-2 pt-2">
<Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>{t('admin2.users.cancel')}</Button>
                <Button type="submit" disabled={adding}>
                  {adding ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> {t('admin2.users.adding')}</> : t('admin2.users.addUser')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-sm p-6 mx-4">
            <h2 className="text-lg font-semibold text-on-surface mb-2">Delete User</h2>
            <p className="text-sm text-on-surface-variant mb-4">
              Are you sure you want to delete <strong>{deleteTarget.display_name || deleteTarget.email}</strong>?
              This action cannot be undone.
            </p>
            {deleteError && (
              <p className="text-xs text-destructive mb-4">{deleteError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteError('') }}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Deleting...</> : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
