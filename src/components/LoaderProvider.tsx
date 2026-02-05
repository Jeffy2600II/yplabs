'use client';

import React from 'react';

/**
 * LoaderProvider: provider แบบเรียบง่ายพร้อม spinner และข้อความภาษาไทย
 * สามารถต่อยอดเป็น context ที่ควบคุมการแสดง loader ได้ต่อไป
 */
export default function LoaderProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* loader กลาง — ถูกตั้งเป็น hidden โดยปริยาย; เปิดโดย JS ถ้าต้องการ */}
      <div id="global-loader" aria-hidden="true" style={{display:'none'}}>
        <div style={{
          position:'fixed',inset:0,display:'flex',alignItems:'center',justifyContent:'center',
          background:'rgba(0,0,0,0.28)',zIndex:9999
        }}>
          <div style={{background:'#fff',padding:20,borderRadius:12,display:'flex',flexDirection:'column',alignItems:'center',gap:8,boxShadow:'0 8px 30px rgba(12,14,20,0.12)'}}>
            <div style={{width:36,height:36,borderRadius:18,border:'4px solid #e6e9ef',borderTopColor:'#2563eb',animation:'spin 1s linear infinite'}} />
            <div style={{color:'#1f2937'}}>กำลังโหลด...</div>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}