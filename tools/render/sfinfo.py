import sys,struct,os
def chunks(d,off,end):
    while off<end:
        cid=d[off:off+4];sz=struct.unpack('<I',d[off+4:off+8])[0];yield cid,off+8,sz
        if cid==b'LIST': pass
        off+=8+sz+(sz&1)
def info(path):
    d=open(path,'rb').read();sub={}
    for name in [b'smpl',b'sm24',b'phdr',b'pbag',b'pgen',b'inst',b'ibag',b'igen',b'shdr']:
        i=d.find(name, 0 if name in (b'smpl',b'sm24') else d.find(b'pdta'))
        if i>=0: sub[name]=(i+8,struct.unpack('<I',d[i+4:i+8])[0])
    rec=lambda name,size:[d[sub[name][0]+i*size:sub[name][0]+(i+1)*size] for i in range(sub[name][1]//size)]
    phdr=rec(b'phdr',38);pbag=rec(b'pbag',4);pgen=rec(b'pgen',4);inst=rec(b'inst',22);ibag=rec(b'ibag',4);igen=rec(b'igen',4);shdr=rec(b'shdr',46)
    smpl=sub.get(b'smpl',(0,0))[1];sm24=b'sm24' in sub
    rates=sorted({struct.unpack('<I',s[36:40])[0] for s in shdr[:-1]})
    sfmt=" (SF3: Ogg-compressed)" if any(struct.unpack('<H',s[44:46])[0]&0x10 for s in shdr[:-1]) else ""
    print(f"== {os.path.basename(path)}: file {os.path.getsize(path)/2**20:.1f} MiB, sample data {smpl/2**20:.1f} MiB{sfmt}, {len(shdr)-1} samples, {'24' if sm24 else '16'}-bit, rate {rates}")
    for pi in range(len(phdr)-1):
        name=phdr[pi][:20].split(b'\0')[0].decode('latin1');prog,bank=struct.unpack('<HH',phdr[pi][20:24])
        b0=struct.unpack('<H',phdr[pi][24:26])[0];b1=struct.unpack('<H',phdr[pi+1][24:26])[0]
        insts=set()
        for b in range(b0,b1):
            g0=struct.unpack('<H',pbag[b][:2])[0];g1=struct.unpack('<H',pbag[b+1][:2])[0]
            for g in range(g0,g1):
                op,amt=struct.unpack('<HH',pgen[g]);
                if op==41: insts.add(amt)
        zones=0;vel=set();keys=set();smp=set()
        for ii in insts:
            z0=struct.unpack('<H',inst[ii][20:22])[0];z1=struct.unpack('<H',inst[ii+1][20:22])[0]
            for z in range(z0,z1):
                g0=struct.unpack('<H',ibag[z][:2])[0];g1=struct.unpack('<H',ibag[z+1][:2])[0];vr=(0,127);kr=None;s=None
                for g in range(g0,g1):
                    op=struct.unpack('<H',igen[g][:2])[0];lo,hi=igen[g][2],igen[g][3]
                    if op==44: vr=(lo,hi)
                    if op==43: kr=(lo,hi)
                    if op==53: s=struct.unpack('<H',igen[g][2:4])[0]
                if s is not None: zones+=1;vel.add(vr);keys.add(kr);smp.add(s)
        print(f"   {bank}/{prog:3d} {name:20s} zones {zones:4d}, velocity layers {len(vel)}, key ranges {len(keys)}, samples {len(smp)}")
for p in sys.argv[1:]: info(p)
