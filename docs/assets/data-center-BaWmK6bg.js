import{N as e,h as t}from"./user-oVADwKJx.js";var n=500;async function r(e,t={}){let r=t.pageSize??n;if(!Number.isInteger(r)||r<1)throw RangeError(`Supabase 分页大小必须是正整数`);let i=[];for(let t=0;;t+=r){let n=await e({from:t,to:t+r-1});if(n.error)return{data:null,error:n.error,total:i.length};if(!n.data)return{data:null,error:Error(`分页查询未返回数据，请稍后重试`),total:i.length};if(i.push(...n.data),n.data.length<r)return{data:i,error:null,total:i.length}}}var{supabase:i,keysToSnakeDeep:a,responseHandle:o}=e(),s=500;new t({idKey:`id`,parentKey:`parentId`,childrenKey:`children`});async function c(){return await r(({from:e,to:t})=>{let n=i.from(`sys_dictionary`).select(`
          id,
          type_id,
          code,
          label,
          value,
          sort,
          color,
          tag_type,
          remark,
          parent_id,
          cascade_parent_id,
          dict_type_table:sys_dict_type!inner(
            code,
            name
          )
        `).eq(`status`,`1`).eq(`dict_type_table.status`,`1`).order(`sort`,{ascending:!0}).order(`id`,{ascending:!0}).range(e,t);return o(()=>n,{})},{pageSize:s})}async function l(e){return await o(()=>i.from(`sys_dictionary`).select(`
          id,
          type_id,
          code,
          label,
          value,
          sort,
          color,
          tag_type,
          remark,
          parent_id,
          cascade_parent_id,
          dict_type_table:sys_dict_type!inner(
            code,
            name
          )
        `).eq(`status`,`1`).eq(`dict_type_table.status`,`1`).eq(`dict_type_table.code`,e).order(`sort`,{ascending:!0}).order(`id`,{ascending:!0}),{})}export{c as fetchGetDictList,l as fetchGetDictListByTypeCode};