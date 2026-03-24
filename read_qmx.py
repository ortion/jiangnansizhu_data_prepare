# -*- coding: utf-8 -*-
"""
PPFENG (谱谱风) qmx文件读取器
=============================
qmx文件实际上是Microsoft Access Jet Database格式

使用方法:
1. 先安装 Microsoft Access Database Engine
   https://www.microsoft.com/en-us/download/details.aspx?id=54920
2. 安装Python库: pip install pyodbc pandas
3. 运行: python read_qmx.py
"""

import pyodbc
import pandas as pd
import os
import sys


def get_access_driver():
    """获取可用的Access驱动程序"""
    drivers = pyodbc.drivers()
    access_drivers = [d for d in drivers if 'access' in d.lower() or 'microsoft access' in d.lower()]
    return access_drivers[0] if access_drivers else None


def read_qmx_file(qmx_path):
    """
    读取PPFENG qmx文件（Jet数据库格式）

    参数:
        qmx_path: qmx文件路径

    返回:
        dict: {表名: DataFrame}
    """
    if not os.path.exists(qmx_path):
        print(f"错误: 文件不存在 - {qmx_path}")
        return None

    # 检查文件是否是有效的Jet数据库
    with open(qmx_path, 'rb') as f:
        header = f.read(20)
        if b'Standard Jet' not in header:
            print("警告: 文件可能不是有效的Jet数据库")

    # 尝试获取Access驱动
    driver = get_access_driver()
    if driver:
        print(f"使用驱动: {driver}")
        conn_str = f'DRIVER={{{driver}}};DBQ={qmx_path};'
    else:
        # 尝试默认驱动
        possible_drivers = [
            '{Microsoft Access Driver (*.mdb, *.accdb)}',
            '{Microsoft Access Driver (*.mdb)}',
            '{Driver do Microsoft Access (*.mdb)}',
        ]
        conn_str = None
        for drv in possible_drivers:
            try:
                conn = pyodbc.connect(f'DRIVER={drv};DBQ={qmx_path}')
                conn.close()
                conn_str = f'DRIVER={drv};DBQ={qmx_path}'
                print(f"使用驱动: {drv}")
                break
            except:
                continue

    if not conn_str:
        print("错误: 未找到可用的Microsoft Access驱动")
        print("\n请安装 Microsoft Access Database Engine:")
        print("https://www.microsoft.com/en-us/download/details.aspx?id=54920")
        return None

    try:
        # 使用GBK编码连接Access数据库
        conn = pyodbc.connect(conn_str)
        conn.setdecoding(pyodbc.SQL_CHAR, encoding='utf-16-le')
        conn.setdecoding(pyodbc.SQL_WCHAR, encoding='utf-16-le')
        cursor = conn.cursor()

        # 获取所有表
        tables = []
        for row in cursor.tables():
            if row.table_type == 'TABLE':
                tables.append(row.table_name)

        print(f"\n=== 发现 {len(tables)} 个表 ===")
        for t in tables:
            print(f"  - {t}")

        # 读取每个表的数据
        result = {}
        for table_name in tables:
            try:
                # 使用方括号包裹表名，避免特殊字符问题
                df = pd.read_sql(f'SELECT * FROM [{table_name}]', conn)
                result[table_name] = df
                print(f"\n=== 表: {table_name} ({len(df)} 行) ===")
                print(f"列: {list(df.columns)}")
                if len(df) > 0:
                    print(df.head(3).to_string())
            except Exception as e:
                print(f"\n读取表 {table_name} 失败: {e}")

        conn.close()
        return result

    except pyodbc.Error as e:
        print(f"数据库连接失败: {e}")
        print("\n可能的解决方案:")
        print("1. 安装 Microsoft Access Database Engine")
        print("2. 如果使用64位Python，确保安装64位版本")
        print("3. 尝试将qmx文件复制为mdb后用Access打开")
        return None
    except Exception as e:
        print(f"错误: {e}")
        return None


def sanitize_unicode_for_csv(value):
    """
    将非ASCII字符和非可见字符转换为可见格式
    - 私用区字符 (U+E000-U+F8FF) -> [U+XXXX]
    - 控制字符 (0x00-0x1F, 0x7F-0x9F) -> <XX>
    - 非ASCII字符 (包括Latin扩展如 À Ô Á Ɗ 等) -> [U+XXXX]
    - 问号 (?) -> <QUESTION> (可能是GBK解码失败)
    """
    if isinstance(value, str):
        result = []
        for char in value:
            code = ord(char)
            # 非ASCII字符 - 转换为U+XXXX格式
            if code > 127:
                result.append(f'\\u{code:04X}')
            # 控制字符
            elif code < 32 or (0x7F <= code < 0xA0):
                result.append(f'<{code:02X}>')
            # 问号 - 可能是解码失败，也转为Unicode格式
            elif code == 0x3F:
                result.append(f'\\u{code:04X}')
            else:
                result.append(char)
        return ''.join(result)
    return value


def export_to_csv(data, output_dir):
    """将数据导出为CSV文件"""
    if not data:
        print("没有数据可导出")
        return

    os.makedirs(output_dir, exist_ok=True)

    for table_name, df in data.items():
        # 处理DataFrame中的所有字符串列
        df = df.applymap(sanitize_unicode_for_csv)

        safe_name = "".join(c if c.isalnum() or c in ('_', '-') else '_' for c in table_name)
        csv_path = os.path.join(output_dir, f"{safe_name}.csv")
        df.to_csv(csv_path, index=False, encoding='utf-16-le')
        print(f"已导出: {csv_path}")


if __name__ == '__main__':
    # 默认使用桌面上的示例文件
    default_path = r'd:\code\music\qmx_reader\36.qmx'

    if len(sys.argv) > 1:
        qmx_path = sys.argv[1]
    else:
        qmx_path = default_path

    print(f"读取文件: {qmx_path}")
    print("=" * 50)

    data = read_qmx_file(qmx_path)

    if data:
        # 询问是否导出为CSV
        export = input("\n是否导出为CSV文件? (y/n): ").strip().lower()
        if export == 'y':
            output_dir = os.path.join(os.path.dirname(qmx_path), 'qmx_output')
            export_to_csv(data, output_dir)
            print(f"\n已导出到: {output_dir}")
