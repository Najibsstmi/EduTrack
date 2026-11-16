import test from 'node:test'
import assert from 'node:assert/strict'
import { buildClassAnalysis, comparisonSignature, rankClasses } from '../src/lib/classPerformance.js'

const students = [{enrollment_id:'a',tingkatan:'Tingkatan 1'},{enrollment_id:'b',tingkatan:'Tingkatan 1'},{enrollment_id:'c',tingkatan:'Tingkatan 1'}]
const gradeScales = [
  {grade_label:'Tingkatan 1',academic_year:2026,grade_name:'A',min_mark:80,max_mark:100,grade_point:1},
  {grade_label:'Tingkatan 1',academic_year:2026,grade_name:'C',min_mark:50,max_mark:79,grade_point:3},
  {grade_label:'Tingkatan 1',academic_year:2026,grade_name:'D',min_mark:35,max_mark:49,grade_point:4},
  {grade_label:'Tingkatan 1',academic_year:2026,grade_name:'F',min_mark:0,max_mark:34,grade_point:6},
]
const subject={id:'science',subject_name:'Sains',subject_type:'selective'}
const makeRows=(metrics)=>buildClassAnalysis({students,subjects:[subject],enrollmentSet:new Set(['a__science','b__science']),gradeScales,academicYear:2026,examKey:'AR1',getMetric:(student)=>metrics[student.enrollment_id] || {},isPassGrade:(grade)=>['A','C','D'].includes(grade)})

test('subjek elektif menggunakan calon berdaftar dan keputusan sah sahaja',()=>{
  const [row]=makeRows({a:{mark:52,grade_name:'C'},b:{mark:40,grade_name:'D'},c:{mark:85,grade_name:'A'}})
  assert.equal(row.scoredCount,2)
  assert.equal(row.passCount,2)
  assert.equal(row.minimumCount,1)
  assert.equal(row.belowCount,1)
  assert.equal(row.minimumRate,50)
  assert.equal(row.gp,3.5)
  assert.equal(Object.values(row.gradeCounts).reduce((a,b)=>a+b,0),2)
})

test('markah kosong atau tidak hadir tidak menjadi sifar atau keputusan sah',()=>{
  const [row]=makeRows({a:{mark:null,grade_name:'F'},b:{mark:0,grade_name:'F',is_absent:true}})
  assert.equal(row.scoredCount,0)
  assert.equal(row.gp,null)
  assert.equal(row.passRate,null)
  assert.equal(row.minimumRate,null)
})

test('pemetaan mengikut skala tahun dan markah, bukan gred lama yang tersimpan',()=>{
  const [row]=makeRows({a:{mark:51,grade_name:'D'}})
  assert.equal(row.valid[0].grade,'C')
  assert.equal(row.minimumCount,1)
  assert.equal(row.valid[0].threshold,50)
})

test('perbandingan mengenal pasti perubahan set calon dan subjek',()=>{
  const [one]=makeRows({a:{mark:55}})
  const [two]=makeRows({b:{mark:55}})
  assert.notEqual(comparisonSignature([one]),comparisonSignature([two]))
})

test('kelas yang GPS sama berkongsi kedudukan',()=>{
  const ranks=rankClasses([{class_name:'B',gps:2},{class_name:'A',gps:2},{class_name:'C',gps:3},{class_name:'D',gps:null}])
  assert.deepEqual(ranks.map((row)=>row.rank),[1,1,3])
})

test('status lulus mengikut konfigurasi gred apabila tersedia',()=>{
  const scales=gradeScales.map((row)=>row.grade_name==='D' ? {...row,is_pass:false} : row)
  const [row]=buildClassAnalysis({students,subjects:[subject],enrollmentSet:new Set(['a__science']),gradeScales:scales,academicYear:2026,examKey:'AR1',getMetric:()=>({mark:40}),isPassGrade:()=>true})
  assert.equal(row.scoredCount,1)
  assert.equal(row.passCount,0)
})
