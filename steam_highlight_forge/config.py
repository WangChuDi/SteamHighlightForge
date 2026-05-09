import yaml
from pathlib import Path
from typing import Dict, Any, Optional


class Config:
    def __init__(self, config_path: Path = None):
        self.config_path = config_path or Path("config.yaml")
        self.data: Dict[str, Any] = {}
        self.load()
    
    def load(self):
        if self.config_path.exists():
            with open(self.config_path, 'r', encoding='utf-8') as f:
                self.data = yaml.safe_load(f) or {}
        
        local_config = self.config_path.parent / "config.local.yaml"
        if local_config.exists():
            with open(local_config, 'r', encoding='utf-8') as f:
                local_data = yaml.safe_load(f) or {}
                self._merge_dict(self.data, local_data)
    
    def _merge_dict(self, base: dict, override: dict):
        for key, value in override.items():
            if key in base and isinstance(base[key], dict) and isinstance(value, dict):
                self._merge_dict(base[key], value)
            else:
                base[key] = value
    
    def get(self, key: str, default: Any = None) -> Any:
        keys = key.split('.')
        value = self.data
        for k in keys:
            if isinstance(value, dict):
                value = value.get(k)
                if value is None:
                    return default
            else:
                return default
        return value
    
    def get_game_config(self, game_key: str) -> Optional[Dict[str, Any]]:
        return self.get(f'games.{game_key}')
