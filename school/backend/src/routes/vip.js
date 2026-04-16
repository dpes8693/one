import express from 'express'
import pool from '../db.js'
import { callFireEdge } from '../services/opennebula.js'

const router = express.Router()

// GET /api/vip/active — 列出目前 active 的插隊紀錄（需要 admin JWT）
router.get('/active', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, vip_vm_id, preempted_vm_id, preempted_at, status
         FROM vip_preemptions
        WHERE status = 'active'
        ORDER BY preempted_at DESC`
    )
    return res.json(result.rows)
  } catch (err) {
    console.error('[VIP Active] 錯誤:', err.message)
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

// POST /api/vip/preempt — VIP 插隊（需要 admin JWT）
router.post('/preempt', async (req, res) => {
  const { vip_vm_id, target_host_id } = req.body

  if (!vip_vm_id || !target_host_id) {
    return res.status(400).json({ error: '請提供 vip_vm_id 和 target_host_id' })
  }

  try {
    // 取得 token
    const token = req.user.one_token

    // 1. 取得 host info，找到佔用 GPU 的 VM
    const hostInfo = await callFireEdge('GET', `/host/info/${target_host_id}`, null, token)
    const pciDevices = hostInfo?.data?.HOST?.HOST_SHARE?.PCI_DEVICES?.PCI
    const pcis = Array.isArray(pciDevices) ? pciDevices : pciDevices ? [pciDevices] : []
    const occupantVmId = pcis.find(p => p.VMID && p.VMID !== '-1')?.VMID

    if (!occupantVmId) {
      return res.status(404).json({ error: '找不到佔用 GPU 的 VM' })
    }

    // 2. 暫停佔用者
    await callFireEdge('PUT', `/vm/action/${occupantVmId}`, { action: 'stop' }, token)

    // 3. 啟動 VIP VM
    await callFireEdge('PUT', `/vm/action/${vip_vm_id}`, { action: 'resume' }, token)

    // 4. 寫 vip_preemptions 表
    const result = await pool.query(
      `INSERT INTO vip_preemptions
         (vip_user_id, vip_vm_id, preempted_vm_id, preempted_user_id, gpu_host_id, action, status)
       VALUES ($1, $2, $3, $4, $5, 'preempt', 'active')
       RETURNING *`,
      [
        req.user.one_user_id || 0,
        vip_vm_id,
        occupantVmId,
        0, // preempted_user_id 若需要可從 VM info 取
        target_host_id,
      ]
    )

    return res.status(201).json({
      vip_preemption_id: result.rows[0].id,
      preempted_vm_id: occupantVmId,
      record: result.rows[0],
    })
  } catch (err) {
    console.error('[VIP Preempt] 錯誤:', err.message)
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

// POST /api/vip/restore — 還原被插隊的 VM（需要 admin JWT）
router.post('/restore', async (req, res) => {
  const { vip_preemption_id } = req.body

  if (!vip_preemption_id) {
    return res.status(400).json({ error: '請提供 vip_preemption_id' })
  }

  try {
    const token = req.user.one_token

    // 1. 查出 preemption 紀錄
    const preemptResult = await pool.query(
      'SELECT * FROM vip_preemptions WHERE id = $1',
      [vip_preemption_id]
    )
    if (preemptResult.rows.length === 0) {
      return res.status(404).json({ error: '找不到 VIP 插隊紀錄' })
    }
    const preemption = preemptResult.rows[0]

    if (preemption.status !== 'active') {
      return res.status(400).json({ error: '此插隊紀錄已還原' })
    }

    // 2. 停止 VIP VM
    await callFireEdge('PUT', `/vm/action/${preemption.vip_vm_id}`, { action: 'stop' }, token)

    // 3. 恢復被佔用的 VM
    await callFireEdge('PUT', `/vm/action/${preemption.preempted_vm_id}`, { action: 'resume' }, token)

    // 4. 更新狀態
    const updated = await pool.query(
      `UPDATE vip_preemptions
         SET status = 'restored', restored_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [vip_preemption_id]
    )

    return res.json({
      message: '已還原',
      record: updated.rows[0],
    })
  } catch (err) {
    console.error('[VIP Restore] 錯誤:', err.message)
    return res.status(500).json({ error: err.message || '伺服器錯誤' })
  }
})

export default router
