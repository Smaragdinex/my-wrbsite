# 找「行尾註解吞掉後面程式碼」:// 之後出現 ; 再接程式(英文識別字 + 指派 / 呼叫)
import re, sys
pat = re.compile(r'//[^\n]*?[;)}]\s*(const |let |var |if \(|for \(|return |[A-Za-z_$][\w$]*(\.[\w$]+)*\s*(\(|=[^=]|\+=))')
bad = 0
for f in sys.argv[1:]:
    for i, line in enumerate(open(f, encoding='utf-8'), 1):
        j = line.find('//')
        if j < 0 or 'http' in line[j:j+12]: continue
        if line[:j].count("'") % 2 or line[:j].count('`') % 2 or line[:j].count('"') % 2: continue   # // 在字串裡
        if pat.search(line[j:]): print(f'{f}:{i}: {line[j:j+150].rstrip()}'); bad += 1
print('found', bad)
