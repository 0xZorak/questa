use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Uint128};
use cw_storage_plus::{Item, Map};

#[cw_serde]
pub enum CampaignStatus {
    Active,
    Ended,
    Cancelled,
    Distributed,
}

#[cw_serde]
pub struct Campaign {
    pub id: u64,
    pub creator: Addr,
    /// Optional operator address that can call DistributeRewards on behalf of the creator.
    /// Set to the agent wallet address to allow autonomous reward distribution.
    pub operator: Option<Addr>,
    pub title: String,
    pub description: String,
    pub target_platform: String,
    pub reward_pool: Uint128,
    pub duration_days: u64,
    pub max_participants: u32,
    pub participant_count: u32,
    pub status: CampaignStatus,
    pub created_at: u64,
    pub ends_at: u64,
    pub distributed: bool,
}

#[cw_serde]
pub struct Participant {
    pub address: Addr,
    pub content_hash: Option<String>,
    pub post_url: Option<String>,
    pub joined_at: u64,
    pub reward_claimed: bool,
    pub reward_amount: Uint128,
}

#[cw_serde]
pub struct GlobalStats {
    pub total_campaigns: u64,
    pub total_participants: u64,
    pub total_rewards_distributed: Uint128,
}

pub const CAMPAIGN_COUNT: Item<u64> = Item::new("campaign_count");
pub const CAMPAIGNS: Map<u64, Campaign> = Map::new("campaigns");
// key: (campaign_id, participant_addr)
pub const PARTICIPANTS: Map<(u64, &Addr), Participant> = Map::new("participants");
// key: campaign_id -> list of participant addrs (stored as separate entries)
pub const CAMPAIGN_PARTICIPANTS: Map<(u64, u32), Addr> = Map::new("campaign_participants");
pub const STATS: Item<GlobalStats> = Item::new("stats");
