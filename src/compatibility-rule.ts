import { MCConfig } from './mcenv';
import { getOS } from './osutil';

export interface CompatibilityRule {
    action: 'allow';
    features?: {
        has_custom_resolution?: boolean;
        is_demo_user?: boolean;
    };
    os?: {
        name?: string;
        version?: string;
        arch?: string;
    };
}
export function checkRule(env: MCConfig, rules: CompatibilityRule[]){
    for (let rule of rules){
        if(rule.os){
            var { osName, osV, osArch } = getOS();
            if(rule.os.name && rule.os.name !== osName){
                return false;
            }
            if(rule.os.version && !new RegExp(rule.os.version).test(osV)){
                return false;
            }
            if(rule.os.arch && rule.os.arch !== osArch){
                return false;
            }
        }
        if(rule.features){
            if(rule.features.has_custom_resolution && !env.resolution){
                return false;
            }
            if(rule.features.is_demo_user && !env.isDemo){
                return false;
            }
        }
    }
    return true;
}