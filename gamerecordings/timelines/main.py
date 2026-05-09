import json
import re
import sys

def fix_json_file(filename):
    """
    修复损坏的JSON文件
    """
    try:
        # 读取文件内容
        with open(filename, 'r', encoding='utf-8') as file:
            content = file.read()
        
        print(f"开始修复文件: {filename}")
        
        # 修复步骤1: 将 "entries:" 后的 { 替换为 [
        content = re.sub(r'"entries":\s*{', '"entries": [', content)
        print("✓ 修复了 entries 块的起始括号")
        
        # 修复步骤2: 在文件末尾，将 "endtime:" 前的最后一个 } 替换为 ]
        # 找到最后一个 } 在 "endtime:" 之前的位置
        endtime_pos = content.rfind('"endtime":')
        if endtime_pos != -1:
            # 找到在 endtime 之前的最后一个 }
            last_curly_before_endtime = content.rfind('}', 0, endtime_pos)
            if last_curly_before_endtime != -1:
                # 替换为 ]
                content = content[:last_curly_before_endtime] + ']' + content[last_curly_before_endtime+1:]
                print("✓ 修复了文件末尾的结束括号")
        
        # 修复步骤3: 移除所有标记器中的 "x:" 数字
        # 匹配模式: "x:" 后跟数字，然后是 { 开始标记器信息
        pattern = r'"x":\s*(\d+)\s*,\s*\{'
        replacement = '{'
        
        # 计算替换次数
        replacements_count = len(re.findall(pattern, content))
        content = re.sub(pattern, replacement, content)
        print(f"✓ 移除了 {replacements_count} 个标记器中的 'x:' 数字")
        
        # 验证修复后的JSON是否有效
        try:
            json.loads(content)
            print("✓ 修复后的JSON格式验证成功")
        except json.JSONDecodeError as e:
            print(f"⚠ 警告: 修复后的JSON仍然存在格式问题: {e}")
            print("建议手动检查文件内容")
        
        # 写入修复后的内容
        output_filename = filename.replace('.json', '_fixed.json')
        with open(output_filename, 'w', encoding='utf-8') as file:
            file.write(content)
        
        print(f"✓ 修复完成! 输出文件: {output_filename}")
        return True
        
    except FileNotFoundError:
        print(f"错误: 文件 {filename} 未找到")
        return False
    except Exception as e:
        print(f"错误: 处理文件时发生异常: {e}")
        return False

def main():
    """
    主函数
    """
    if len(sys.argv) != 2:
        print("使用方法: python fix_json.py <filename>")
        print("示例: python fix_json.py corrupted_data.json")
        sys.exit(1)
    
    filename = sys.argv[1]
    
    if not filename.endswith('.json'):
        print("错误: 请提供一个JSON文件")
        sys.exit(1)
    
    success = fix_json_file(filename)
    
    if success:
        print("\n修复过程完成!")
    else:
        print("\n修复过程失败!")
        sys.exit(1)

if __name__ == "__main__":
    main()