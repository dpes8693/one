import pool from '../db.js'
import { callFireEdge } from './opennebula.js'

// 追蹤持續告警狀態（in-memory，服務重啟後歸零）
const alertState = new Map() // key: `${vmId}:${alertType}`, value: firstSeenEpoch

const SUSTAINED_MINUTES = 5
const HIGH_UTIL_THRESHOLD = 95
const LOW_MEM_THRESHOLD = 1024 // MB

/**
 * 檢查所有 RUNNING VM 的 GPU 使用情況，寫入告警
 * 由 scheduler 每分鐘呼叫
 */
export async function checkGpuAlerts() {
  try {
    // 取出所有 approved 且有 VM 的紀錄
    const { rows } = await pool.query(
      `SELECT one_vm_id FROM application_reviews
        WHERE decision = 'approved' AND one_vm_id IS NOT NULL`
    )

    const nowEpoch = Math.floor(Date.now() / 1000)

    for (const review of rows) {
      try {
        const vmInfo = await callFireEdge('GET', `/vm/info/${review.one_vm_id}`, null, null)
        const vm = vmInfo?.data?.VM
        if (!vm) continue

        const lcmState = parseInt(vm.LCM_STATE || '0', 10)
        // LCM_STATE=3 表示 RUNNING
        if (lcmState !== 3) {
          // 不在 running 狀態，清除追蹤
          alertState.delete(`${review.one_vm_id}:high_utilization`)
          alertState.delete(`${review.one_vm_id}:low_memory`)
          continue
        }

        const monitoring = vm.MONITORING || {}
        const gpuUtil = parseFloat(monitoring.GPU_UTILIZATION || '0')
        const gpuMemFree = parseFloat(monitoring.GPU_MEMORY_FREE || '99999')
        const vmName = vm.NAME || String(review.one_vm_id)

        await checkAlert({
          vmId: review.one_vm_id,
          vmName,
          alertType: 'high_utilization',
          condition: gpuUtil > HIGH_UTIL_THRESHOLD,
          metricValue: gpuUtil,
          nowEpoch,
        })

        await checkAlert({
          vmId: review.one_vm_id,
          vmName,
          alertType: 'low_memory',
          condition: gpuMemFree < LOW_MEM_THRESHOLD,
          metricValue: gpuMemFree,
          nowEpoch,
        })
      } catch (err) {
        console.error(`[GpuAlert] VM ${review.one_vm_id} 檢查失敗:`, err.message)
      }
    }
  } catch (err) {
    console.error('[GpuAlert] 查詢 VM 列表失敗:', err.message)
  }
}

async function checkAlert({ vmId, vmName, alertType, condition, metricValue, nowEpoch }) {
  const key = `${vmId}:${alertType}`

  if (!condition) {
    alertState.delete(key)
    return
  }

  const firstSeen = alertState.get(key)
  if (!firstSeen) {
    alertState.set(key, nowEpoch)
    return
  }

  const sustainedSeconds = nowEpoch - firstSeen
  if (sustainedSeconds >= SUSTAINED_MINUTES * 60) {
    // 寫入告警，並重置計時（避免重複寫入）
    await pool.query(
      `INSERT INTO gpu_alerts (vm_id, vm_name, alert_type, metric_value)
       VALUES ($1, $2, $3, $4)`,
      [vmId, vmName, alertType, metricValue]
    )
    // 重置，下次若仍持續會再計時
    alertState.set(key, nowEpoch)
  }
}
