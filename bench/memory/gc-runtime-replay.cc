// Independent offline extent arithmetic. No Node/V8 code or runtime launch.
// Compile with clang++ -std=c++17 -O2; the Python wrapper checks JSON and hashes.
#include <algorithm>
#include <array>
#include <cstdint>
#include <cstdio>
#include <iostream>
#include <map>
#include <stdexcept>
#include <string>
#include <tuple>
#include <vector>
using U = uint64_t;
void need(bool b, const char* why) { if (!b) throw std::runtime_error(why); }
U end(U a, U n) { need(a > 0 && n > 0 && a <= UINT64_MAX-n, "invalid extent"); return a+n; }
void plus(U& a,U b){need(a<=UINT64_MAX-b,"metric overflow");a+=b;}
struct Extents {
  std::map<U,U> m; U total=0;
  auto overlap(U a,U b) const {
    auto i=m.lower_bound(a);
    if(i!=m.begin()) { auto p=std::prev(i); if(p->second>a) i=p; }
    if(i!=m.end() && i->first<b && i->second>a) return i;
    return m.end();
  }
  std::vector<std::pair<U,U>> pieces(U a,U b) const {
    std::vector<std::pair<U,U>> out;
    for(auto i=overlap(a,b);i!=m.end() && i->first<b;++i)
      out.emplace_back(std::max(a,i->first),std::min(b,i->second));
    return out;
  }
  void add(U a,U b) {
    need(a>0 && b>a && overlap(a,b)==m.end(),"overlapping extent");
    need(m.size()<1000000,"offline extent map cap");
    m.emplace(a,b); total+=b-a;
  }
  U cut(U a,U b) {
    U removed=0;
    for(;;) {
      auto i=overlap(a,b); if(i==m.end()) break;
      U x=i->first,y=i->second; total-=y-x; m.erase(i);
      removed+=std::min(y,b)-std::max(x,a);
      if(x<a) add(x,a); if(b<y) add(b,y);
    }
    return removed;
  }
  U covered(U a,U b) const { U n=0; for(auto p:pieces(a,b)) n+=p.second-p.first; return n; }
};
struct Reader {
  FILE* f; U bytes=0,cap;
  Reader(const char* path,U limit):f(std::fopen(path,"rb")),cap(limit){need(f,"open failed");}
  ~Reader(){std::fclose(f);}
  int byte(){int c=std::fgetc(f);need(c!=EOF,"truncated stream");need(++bytes<=cap,"offline byte cap");return c;}
  U integer(){U n=0;for(int k=0;k<10;++k){U b=byte();need(k<9 || b<=1,"integer overflow");n|=(b&127)<<(7*k);if(!(b&128)){need(k==0 || b!=0,"noncanonical integer");return n;}}throw std::runtime_error("unterminated integer");}
  std::string text(U n){need(n<=4096,"text frame bound");std::string s;for(U i=0;i<n;++i)s+=char(byte());return s;}
};
int main(int argc,char**argv) {
 try {
  need(argc==3,"supply raw file and MiB bound");
  std::string arg=argv[2]; need(arg=="256" || arg=="512" || arg=="2048","offline bound choice");
  Reader r(argv[1],std::stoull(arg)*1024*1024);
  std::string header;for(int i=0;i<4096;++i){char c=r.byte();if(c=='\n')break;header+=c;need(i<4095,"header bound");}
  Extents state,sources,destinations;
  std::vector<std::tuple<U,U,U>> moves;
  std::vector<std::pair<U,U>> census;
  std::map<U,std::array<U,3>> marks;
  U count=0,gross=0,peak=0,trimmed=0,reclaimed=0,gcs=0,moveCount=0,censusCount=0,before=0,collector=0,badSeq=0,footerAt=0;
  bool gc=false; std::string failure,footer;
  for(;;) {
   U start=r.bytes,kind=r.integer();
   if(kind==0){footerAt=start;footer=r.text(r.integer());need(std::fgetc(r.f)==EOF,"trailing bytes");break;}
   need(kind<=10,"unknown event");
   U a=r.integer(),to=r.integer(),size=r.integer(),old=r.integer(),marker=r.integer(); ++count;
   if(!failure.empty()) continue;
   try {
    switch(kind) {
     case 1:need(!gc,"birth during GC");state.add(a,end(a,size));plus(gross,size);peak=std::max(peak,state.total);break;
     case 2:
      need(size>0,"empty move");
      if(!gc){need(to>a,"unsupported non-GC move");U b=end(to,size),covered=state.covered(a,b);need(covered==0 || covered==b-a,"partial left trim");if(covered)plus(trimmed,state.cut(a,to));}
      else{sources.add(a,end(a,size));destinations.add(to,end(to,size));need(moves.size()<1000000,"offline move cap");moves.emplace_back(a,to,size);++moveCount;}
      break;
     case 3:
      need(size>0 && size<=old,"invalid shrink");
      if(!gc){U b=end(a,old),covered=state.covered(a,b);need(covered==0 || covered==old,"partial shrink");if(covered)plus(trimmed,state.cut(a+size,b));}
      else {
       U b=end(a,old);need(state.covered(a,b)==0,"tracked GC shrink");
       for(auto [src,dst,n]:moves)for(auto p:state.pieces(src,end(src,n)))need(dst+(p.second-src)<=a || dst+(p.first-src)>=b,"moved tracked GC shrink");
      }
      break;
     case 4:break; // Corroborating update, never count a second resize.
     case 5:
      need(size==state.total && old==peak,"mark metric mismatch");
      need(marks.count(marker) || marks.size()<4096,"offline mark cap");
      if(!marks.count(marker))marks[marker]={0,count,count};
      ++marks[marker][0];marks[marker][2]=count;break;
     case 6:case 7:need(state.covered(a,end(a,size))<=size,"inspection mismatch");break;
     case 8:
      need(!gc && marker<=1 && size==state.total,"invalid GC begin");gc=true;collector=marker;before=state.total;++gcs;break;
     case 10:
      need(gc && size>0,"census outside GC");need(census.size()<4000000,"offline census cap");census.emplace_back(a,end(a,size));++censusCount;break;
     case 9: {
      need(gc && marker==collector && old==before,"invalid GC end");
      std::vector<std::pair<U,U>> tagged;
      for(auto [src,dst,n]:moves)for(auto p:state.pieces(src,end(src,n)))tagged.emplace_back(dst+(p.first-src),dst+(p.second-src));
      for(auto [src,dst,n]:moves){state.cut(src,end(src,n));state.cut(dst,end(dst,n));}
      for(auto p:tagged)state.add(p.first,p.second);
      Extents occupied,survivors;
      for(auto p:census){occupied.add(p.first,p.second);for(auto q:state.pieces(p.first,p.second))survivors.add(q.first,q.second);}
      need(survivors.total<=before,"GC increased tracked bytes");plus(reclaimed,before-survivors.total);state=std::move(survivors);
      need(size==state.total,"GC metric mismatch");gc=false;sources=Extents{};destinations=Extents{};moves.clear();census.clear();break;
     }
    }
   }catch(const std::exception&e){failure=e.what();badSeq=count;}
  }
  std::cout<<"{\"header\":"<<header<<",\"footer\":"<<footer<<",\"bytes\":"<<r.bytes<<",\"footerAt\":"<<footerAt<<",\"events\":"<<count
   <<",\"gross\":"<<gross<<",\"peak\":"<<peak<<",\"stop\":"<<state.total<<",\"trimmed\":"<<trimmed<<",\"reclaimed\":"<<reclaimed
   <<",\"gcs\":"<<gcs<<",\"moves\":"<<moveCount<<",\"census\":"<<censusCount<<",\"openGc\":"<<(gc?"true":"false")
   <<",\"failureSequence\":"<<badSeq<<",\"failure\":\""<<failure<<"\",\"marks\":{";
  bool first=true;for(auto [id,row]:marks){if(!first)std::cout<<',';first=false;std::cout<<'\"'<<id<<"\":{\"count\":"<<row[0]<<",\"firstSequence\":"<<row[1]<<",\"lastSequence\":"<<row[2]<<'}';}
  std::cout<<"}}\n";
 }catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}
}
