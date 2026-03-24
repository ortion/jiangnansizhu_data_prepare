import csv
from dataclasses import dataclass
from enum import Enum, auto

# ============================================================
# 第一层：Token 定义
# ============================================================

class TokenType(Enum):
    NOTE = auto()         # 1-7 音高
    PREFIX_MOD = auto()   # 8/b/x/z 前缀修饰符（出现在主音之前）
    SUFFIX_MOD = auto()   # ：后缀修饰符（出现在主音之后）
    SEPARATOR = auto()    # / 分隔符
    ORNAMENT = auto()     # !...@ 装饰音块（整体作为一个 token）
    TECH = auto()         # \u00C0...\u00C1 前缀特殊技法块
    TECH_SUFFIX = auto()   # \u0448...\u0449 后缀特殊技法块
    UNKNOWN = auto()       # 未识别的字符（需要检查是否遗漏）


@dataclass
class Token:
    type: TokenType
    value: str


# ============================================================
# 第二层：Tokenizer - 把字符串切成最小语义单元
# ============================================================

def tokenize(data: str) -> list[Token]:
    """把简谱字符串切分成 token 列表"""
    tokens = []
    i = 0

    while i < len(data):
        char = data[i]

        # 1. 装饰音 !...@（必须先判断，避免内部字符被误判）
        if char == '!':
            end = data.find('@', i + 1)
            if end != -1:
                tokens.append(Token(TokenType.ORNAMENT, data[i:end + 1]))
                i = end + 1
                # 如果 @ 后面紧跟前缀修饰符，切出来
                if i < len(data) and data[i] in '8bxz':
                    tokens.append(Token(TokenType.PREFIX_MOD, data[i]))
                    i += 1
            else:
                i += 1
            continue

        # 2. 前缀特殊技法 \u00C0...\u00C1（必须先判断）
        PREFIX_TECH_START = '\\u00C0'
        PREFIX_TECH_END = '\\u00C1'
        if data[i:].startswith(PREFIX_TECH_START):
            end = data.find(PREFIX_TECH_END, i + len(PREFIX_TECH_START))
            if end != -1:
                tokens.append(Token(TokenType.TECH, data[i:end + len(PREFIX_TECH_END)]))
                i = end + len(PREFIX_TECH_END)
                # 如果 \u00C1 后面紧跟前缀修饰符，切出来
                if i < len(data) and data[i] in '8bxz':
                    tokens.append(Token(TokenType.PREFIX_MOD, data[i]))
                    i += 1
            else:
                i += len(PREFIX_TECH_START)
            continue

        # 3. 后缀特殊技法 \u0448...\u0449
        SUFFIX_TECH_START = '\\u0448'
        SUFFIX_TECH_END = '\\u0449'
        if data[i:].startswith(SUFFIX_TECH_START):
            end = data.find(SUFFIX_TECH_END, i + len(SUFFIX_TECH_START))
            if end != -1:
                tokens.append(Token(TokenType.TECH_SUFFIX, data[i:end + len(SUFFIX_TECH_END)]))
                i = end + len(SUFFIX_TECH_END)
            else:
                i += len(SUFFIX_TECH_START)
            continue

        # 4. 主音 1-7
        if char in '01234567':
            tokens.append(Token(TokenType.NOTE, char))
            i += 1
            continue

        # 5. 前缀修饰符：8(高八度) b(低八度) z(八分) x(十六分) c(三十二分)   
        if char in '8bxzc':
            tokens.append(Token(TokenType.PREFIX_MOD, char))
            i += 1
            continue

        # 6. 后缀修饰符 ：(两拍) N(延长)（必须先判断，避免冒号被误判为前缀修饰符）
        if char in ':N':
            tokens.append(Token(TokenType.SUFFIX_MOD, char))
            i += 1
            continue

        # 7. 分隔符 /
        if char in ';/ ':
            tokens.append(Token(TokenType.SEPARATOR, char))
            i += 1
            continue

        # 8. 未识别的字符 → 标记为 UNKNOWN
        tokens.append(Token(TokenType.UNKNOWN, char))
        i += 1

    return tokens


def check_unknown_chars(data: str) -> list[str]:
    """
    检查字符串中是否有未处理的字符。
    返回未识别字符的列表（去重）。
    """
    tokens = tokenize(data)
    unknown_chars = sorted({t.value for t in tokens if t.type == TokenType.UNKNOWN})
    return unknown_chars


# ============================================================
# 第三层：Parser - 把 token 组装成音符
# ============================================================

def parse_tokens(tokens: list[Token]) -> list[str]:
    """
    把 token 列表按主音切分成音符列表。
    规则：
    - 装饰音/特殊技法/前缀修饰符(8/b/x/z) → pending_prefix
    - 主音 → current_note
    - 后缀修饰符(:) 和后缀特殊技法(ш...щ) → current_note 后缀
    - / 分隔符 → 保存当前音符
    """
    notes = []
    current_note = ""        # 当前主音
    pending_prefix = ""      # 前缀（装饰音/特殊技法/前缀修饰符）

    for token in tokens:
        # 没有主音时，前缀修饰符和装饰音都累积到 pending_prefix
        if current_note == "":
            if token.type in {TokenType.PREFIX_MOD, TokenType.ORNAMENT, TokenType.TECH}:
                pending_prefix += token.value
            elif token.type == TokenType.NOTE:
                current_note = token.value
        # 当前有主音时，处理规则如下：
        else:
            if token.type in {TokenType.SUFFIX_MOD, TokenType.TECH_SUFFIX}:
                current_note += token.value
            else:
                if token.type == TokenType.SEPARATOR:
                    if current_note!="":
                    # 分隔符 → 直接保存当前音符
                        notes.append(pending_prefix + current_note)
                        pending_prefix = ""
                else: # 遇到了新的主音或前缀修饰符/装饰音/特殊技法 → 先保存当前音符，再处理新 token
                    notes.append(pending_prefix + current_note)
                    pending_prefix = token.value  # 重置前缀
                current_note = ""  # 重置当前音符


    # 处理最后未保存的音符
    if current_note or pending_prefix:
        notes.append(pending_prefix + current_note)

    return notes


# ============================================================
# 第四层：入口函数
# ============================================================

def parse_note(data: str) -> list[str]:
    """解析简谱字符串，返回音符列表"""
    tokens = tokenize(data)
    return parse_tokens(tokens)


# ============================================================
# 测试
# ============================================================

if __name__ == '__main__':
    input_file = 'mem.csv'
    output_file = 'parsed_notes.csv'

    all_unknown_chars = {}  # {字符: [行号列表]}

    with open(input_file, 'r', encoding='utf-16-le') as f_in:
        reader = csv.reader(f_in)
        rows = list(reader)

    # 处理所有行，收集结果
    output_rows = []
    for row in rows:
        if len(row) > 9 and row[7] == 'QMMFont':
            datap = row[9]
            tokens = tokenize(datap)
            notes = parse_note(datap)

            # 收集未识别字符（带行号）
            unknown_chars = check_unknown_chars(datap)
            for c in unknown_chars:
                if c not in all_unknown_chars:
                    all_unknown_chars[c] = []
                all_unknown_chars[c].append(reader.line_num)

            # 音符用 | 分隔
            output_rows.append([datap, '|'.join(notes)])
        else:
            # 其他行不需要处理，跳过
            pass

    # 写入结果
    with open(output_file, 'w', encoding='utf-8', newline='') as f_out:
        writer = csv.writer(f_out)
        writer.writerows(output_rows)

    print(f'处理完成: {len(output_rows)} 行')
    print(f'结果已保存到: {output_file}')

    # 警告未识别字符
    if all_unknown_chars:
        print(f'\n⚠️  未处理的字符:')
        for char in sorted(all_unknown_chars.keys()):
            rows = all_unknown_chars[char]
            print(f'   {repr(char)} (U+{ord(char):04X}) → CSV行号: {rows}')
    else:
        print('\n✅ 所有字符都已处理，无未识别字符')
