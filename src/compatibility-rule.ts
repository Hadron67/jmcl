import { MCConfig } from './mcenv';
import { getOS } from './osutil';

export interface CompatibilityRule {
    action: 'allow' | 'disallow';
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
    let allowed = false, disallowed = false;
    for (let rule of rules){
        let matched = true;
        if(rule.os){
            var { osName, osV, osArch } = getOS();
            if(rule.os.name && rule.os.name !== osName){
                matched = false;
            }
            if(rule.os.version && !new RegExp(rule.os.version).test(osV)){
                matched = false;
            }
            if(rule.os.arch && rule.os.arch !== osArch){
                matched = false;
            }
        }
        if(rule.features){
            if(rule.features.has_custom_resolution && !env.resolution){
                matched = false;
            }
            if(rule.features.is_demo_user && !env.isDemo){
                matched = false;
            }
        }
        
        if (matched){
            if (rule.action === 'allow'){
                allowed = true;
            }
            else if (rule.action === 'disallow'){
                disallowed = true;
            }
        }
    }
    return allowed && !disallowed;
}