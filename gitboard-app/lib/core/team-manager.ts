import { FileSystemManager } from '../file-system';
import type { Team, TeamMember } from '../schemas';

/**
 * Team Manager
 *
 * Handles team member operations: add, remove, update, list
 */
export class TeamManager {
    constructor(private fs: FileSystemManager) {}

    /**
     * Get team configuration
     */
    async getTeam(): Promise<Team> {
        return this.fs.readTeam();
    }

    /**
     * Add a team member
     */
    async addMember(member: TeamMember): Promise<Team> {
        const team = await this.getTeam();

        if (team.team.some((m) => m.id === member.id)) {
            throw new Error(`Team member with ID ${member.id} already exists`);
        }

        const updatedTeam: Team = {
            ...team,
            team: [...team.team, member],
        };

        await this.fs.writeTeam(updatedTeam);
        return updatedTeam;
    }

    /**
     * Remove a team member
     */
    async removeMember(memberId: string): Promise<Team> {
        const team = await this.getTeam();

        const updatedTeam: Team = {
            ...team,
            team: team.team.filter((m) => m.id !== memberId),
        };

        await this.fs.writeTeam(updatedTeam);
        return updatedTeam;
    }

    /**
     * Update a team member
     */
    async updateMember(
        memberId: string,
        updates: Partial<Omit<TeamMember, 'id'>>
    ): Promise<Team> {
        const team = await this.getTeam();

        const memberIndex = team.team.findIndex((m) => m.id === memberId);
        if (memberIndex === -1) {
            throw new Error(`Team member with ID ${memberId} not found`);
        }

        const currentMember = team.team[memberIndex]!;
        const updatedMember: TeamMember = {
            id: memberId,
            type: updates.type ?? currentMember.type,
            name: updates.name ?? currentMember.name,
            metadata: {
                ...currentMember.metadata,
                ...updates.metadata,
            } as TeamMember['metadata'],
            role: {
                ...currentMember.role,
                ...updates.role,
            } as TeamMember['role'],
            capabilities: {
                ...currentMember.capabilities,
                ...updates.capabilities,
            } as TeamMember['capabilities'],
            availability: {
                ...currentMember.availability,
                ...updates.availability,
            } as TeamMember['availability'],
        };

        if (currentMember.ai_config || updates.ai_config) {
            updatedMember.ai_config = {
                ...currentMember.ai_config,
                ...updates.ai_config,
            } as TeamMember['ai_config'];
        }

        const updatedTeam: Team = {
            ...team,
            team: [
                ...team.team.slice(0, memberIndex),
                updatedMember,
                ...team.team.slice(memberIndex + 1),
            ],
        };

        await this.fs.writeTeam(updatedTeam);
        return updatedTeam;
    }

    /**
     * Get a specific team member
     */
    async getMember(memberId: string): Promise<TeamMember | undefined> {
        const team = await this.getTeam();
        return team.team.find((m) => m.id === memberId);
    }

    /**
     * List all team members
     */
    async listMembers(): Promise<TeamMember[]> {
        const team = await this.getTeam();
        return team.team;
    }

    /**
     * List team members by type
     */
    async listMembersByType(type: 'human' | 'ai_agent'): Promise<TeamMember[]> {
        const team = await this.getTeam();
        return team.team.filter((m) => m.type === type);
    }

    /**
     * Find team members by criteria
     */
    async findMembers(criteria: {
        type?: 'human' | 'ai_agent';
        status?: 'active' | 'inactive' | 'on_leave';
        areas?: string[];
        skills?: string[];
    }): Promise<TeamMember[]> {
        const members = await this.listMembers();

        return members.filter((member) => {
            if (criteria.type && member.type !== criteria.type) return false;
            if (criteria.status && member.availability.status !== criteria.status)
                return false;
            if (
                criteria.areas &&
                !criteria.areas.some((area) => member.capabilities.areas.includes(area))
            ) {
                return false;
            }
            if (
                criteria.skills &&
                !criteria.skills.some((skill) =>
                    member.capabilities.skills.includes(skill)
                )
            ) {
                return false;
            }
            return true;
        });
    }
}
