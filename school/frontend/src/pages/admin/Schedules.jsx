import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { getSchedules, createSchedule, updateSchedule, deleteSchedule } from '../../api/schedules.js'

const ACTIONS = ['start', 'stop', 'reboot', 'suspend', 'resume']

function ScheduleDialog({ mode, initial, onClose, onSave, onDelete }) {
  const [vmId, setVmId] = useState(initial?.one_vm_id ?? '')
  const [action, setAction] = useState(initial?.action ?? 'start')
  const [startTime, setStartTime] = useState(initial?.start_time ? initial.start_time.slice(0, 16) : '')
  const [endTime, setEndTime] = useState(initial?.end_time ? initial.end_time.slice(0, 16) : '')

  function handleSubmit(e) {
    e.preventDefault()
    onSave({ one_vm_id: Number(vmId), action, start_time: startTime, end_time: endTime || null })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          {mode === 'create' ? '新增排程' : '編輯排程'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="vm-id" className="block text-sm font-medium text-gray-700 mb-1">
              VM ID
            </label>
            <input
              id="vm-id"
              type="number"
              value={vmId}
              onChange={(e) => setVmId(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="輸入 VM ID"
            />
          </div>
          <div>
            <label htmlFor="action-select" className="block text-sm font-medium text-gray-700 mb-1">
              動作
            </label>
            <select
              id="action-select"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              {ACTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="start-time" className="block text-sm font-medium text-gray-700 mb-1">
              開始時間
            </label>
            <input
              id="start-time"
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="end-time" className="block text-sm font-medium text-gray-700 mb-1">
              結束時間（選填）
            </label>
            <input
              id="end-time"
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-3 justify-between pt-2">
            {mode === 'edit' && (
              <button
                type="button"
                onClick={onDelete}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              >
                刪除
              </button>
            )}
            <div className="flex gap-3 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                儲存
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AdminSchedules() {
  const qc = useQueryClient()
  const [dialog, setDialog] = useState(null) // null | { mode: 'create'|'edit', data, scheduleId }

  const { data: schedulesData } = useQuery({
    queryKey: ['schedules'],
    queryFn: getSchedules,
  })
  const schedules = Array.isArray(schedulesData?.schedules) ? schedulesData.schedules : []

  const createMutation = useMutation({
    mutationFn: createSchedule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] })
      setDialog(null)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateSchedule(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] })
      setDialog(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteSchedule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] })
      setDialog(null)
    },
  })

  const events = schedules.map((s) => ({
    title: `VM#${s.one_vm_id} ${s.action}`,
    start: s.start_time,
    end: s.end_time || undefined,
    extendedProps: { scheduleId: s.id, schedule: s },
  }))

  function handleDateClick(info) {
    setDialog({ mode: 'create', data: { start_time: info.dateStr } })
  }

  function handleEventClick(info) {
    const s = info.event.extendedProps.schedule
    setDialog({ mode: 'edit', scheduleId: info.event.extendedProps.scheduleId, data: s })
  }

  function handleSave(payload) {
    if (dialog.mode === 'create') {
      createMutation.mutate(payload)
    } else {
      updateMutation.mutate({ id: dialog.scheduleId, payload })
    }
  }

  function handleDelete() {
    if (dialog.scheduleId) {
      deleteMutation.mutate(dialog.scheduleId)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">排程行事曆</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek',
          }}
          locale="zh-tw"
          events={events}
          selectable
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          height="auto"
        />
      </div>

      {dialog && (
        <ScheduleDialog
          mode={dialog.mode}
          initial={dialog.data}
          onClose={() => setDialog(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
