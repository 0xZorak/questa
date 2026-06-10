use cosmwasm_std::{
    entry_point, to_json_binary, Addr, BankMsg, Binary, Coin, Deps, DepsMut, Env,
    MessageInfo, Response, StdResult, Uint128,
};
use cw2::set_contract_version;

use crate::error::ContractError;
use crate::msg::{
    CampaignResponse, CampaignsResponse, ExecuteMsg, InstantiateMsg, ParticipantInfo,
    ParticipantsResponse, QueryMsg, RewardResponse, StatsResponse,
};
use crate::state::{
    Campaign, CampaignStatus, GlobalStats, Participant, CAMPAIGN_COUNT,
    CAMPAIGN_PARTICIPANTS, CAMPAIGNS, PARTICIPANTS, STATS,
};

const CONTRACT_NAME: &str = "crates.io:reward_campaign";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");
const INJ_DENOM: &str = "inj";

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    _msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    CAMPAIGN_COUNT.save(deps.storage, &0u64)?;
    STATS.save(
        deps.storage,
        &GlobalStats {
            total_campaigns: 0,
            total_participants: 0,
            total_rewards_distributed: Uint128::zero(),
        },
    )?;
    Ok(Response::new().add_attribute("action", "instantiate"))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::CreateCampaign {
            title,
            description,
            target_platform,
            duration_days,
            max_participants,
            operator,
        } => create_campaign(deps, env, info, title, description, target_platform, duration_days, max_participants, operator),
        ExecuteMsg::JoinCampaign { campaign_id } => join_campaign(deps, env, info, campaign_id),
        ExecuteMsg::SubmitContent { campaign_id, content_hash, post_url } => {
            submit_content(deps, env, info, campaign_id, content_hash, post_url)
        }
        ExecuteMsg::JoinAndSubmit { campaign_id, content_hash, post_url } => {
            join_and_submit(deps, env, info, campaign_id, content_hash, post_url)
        }
        ExecuteMsg::DistributeRewards { campaign_id } => distribute_rewards(deps, env, info, campaign_id),
        ExecuteMsg::ClaimReward { campaign_id } => claim_reward(deps, env, info, campaign_id),
        ExecuteMsg::CancelCampaign { campaign_id } => cancel_campaign(deps, env, info, campaign_id),
    }
}

fn create_campaign(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    title: String,
    description: String,
    target_platform: String,
    duration_days: u64,
    max_participants: u32,
    operator: Option<String>,
) -> Result<Response, ContractError> {
    let reward_pool = info
        .funds
        .iter()
        .find(|c| c.denom == INJ_DENOM)
        .map(|c| c.amount)
        .unwrap_or(Uint128::zero());

    if reward_pool.is_zero() {
        return Err(ContractError::NoFundsSent {});
    }

    let id = CAMPAIGN_COUNT.load(deps.storage)? + 1;
    CAMPAIGN_COUNT.save(deps.storage, &id)?;

    let now = env.block.time.seconds();
    let ends_at = now + duration_days * 86400;

    // Validate and resolve operator address if provided
    let operator_addr: Option<Addr> = match operator {
        Some(ref op) => Some(deps.api.addr_validate(op)?),
        None => None,
    };

    let campaign = Campaign {
        id,
        creator: info.sender.clone(),
        operator: operator_addr,
        title: title.clone(),
        description,
        target_platform,
        reward_pool,
        duration_days,
        max_participants,
        participant_count: 0,
        status: CampaignStatus::Active,
        created_at: now,
        ends_at,
        distributed: false,
    };

    CAMPAIGNS.save(deps.storage, id, &campaign)?;

    let mut stats = STATS.load(deps.storage)?;
    stats.total_campaigns += 1;
    STATS.save(deps.storage, &stats)?;

    Ok(Response::new()
        .add_attribute("action", "create_campaign")
        .add_attribute("campaign_id", id.to_string())
        .add_attribute("creator", info.sender)
        .add_attribute("title", title)
        .add_attribute("reward_pool", reward_pool))
}

fn join_campaign(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    campaign_id: u64,
) -> Result<Response, ContractError> {
    let mut campaign = CAMPAIGNS.load(deps.storage, campaign_id)
        .map_err(|_| ContractError::CampaignNotFound {})?;

    if !matches!(campaign.status, CampaignStatus::Active) {
        return Err(ContractError::CampaignNotActive {});
    }
    if env.block.time.seconds() > campaign.ends_at {
        return Err(ContractError::CampaignEnded {});
    }
    if campaign.participant_count >= campaign.max_participants {
        return Err(ContractError::CampaignFull {});
    }

    if PARTICIPANTS.has(deps.storage, (campaign_id, &info.sender)) {
        return Err(ContractError::AlreadyJoined {});
    }

    let participant = Participant {
        address: info.sender.clone(),
        content_hash: None,
        post_url: None,
        joined_at: env.block.time.seconds(),
        reward_claimed: false,
        reward_amount: Uint128::zero(),
    };

    PARTICIPANTS.save(deps.storage, (campaign_id, &info.sender), &participant)?;
    CAMPAIGN_PARTICIPANTS.save(
        deps.storage,
        (campaign_id, campaign.participant_count),
        &info.sender,
    )?;

    campaign.participant_count += 1;
    CAMPAIGNS.save(deps.storage, campaign_id, &campaign)?;

    let mut stats = STATS.load(deps.storage)?;
    stats.total_participants += 1;
    STATS.save(deps.storage, &stats)?;

    Ok(Response::new()
        .add_attribute("action", "join_campaign")
        .add_attribute("campaign_id", campaign_id.to_string())
        .add_attribute("participant", info.sender))
}

fn submit_content(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    campaign_id: u64,
    content_hash: String,
    post_url: String,
) -> Result<Response, ContractError> {
    let campaign = CAMPAIGNS.load(deps.storage, campaign_id)
        .map_err(|_| ContractError::CampaignNotFound {})?;

    if !matches!(campaign.status, CampaignStatus::Active) {
        return Err(ContractError::CampaignNotActive {});
    }

    let mut participant = PARTICIPANTS
        .load(deps.storage, (campaign_id, &info.sender))
        .map_err(|_| ContractError::NotParticipant {})?;

    if participant.content_hash.is_some() {
        return Err(ContractError::ContentAlreadySubmitted {});
    }

    participant.content_hash = Some(content_hash.clone());
    participant.post_url = Some(post_url);
    PARTICIPANTS.save(deps.storage, (campaign_id, &info.sender), &participant)?;

    Ok(Response::new()
        .add_attribute("action", "submit_content")
        .add_attribute("campaign_id", campaign_id.to_string())
        .add_attribute("content_hash", content_hash))
}

fn join_and_submit(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    campaign_id: u64,
    content_hash: String,
    post_url: String,
) -> Result<Response, ContractError> {
    let mut campaign = CAMPAIGNS.load(deps.storage, campaign_id)
        .map_err(|_| ContractError::CampaignNotFound {})?;

    if !matches!(campaign.status, CampaignStatus::Active) {
        return Err(ContractError::CampaignNotActive {});
    }
    if env.block.time.seconds() > campaign.ends_at {
        return Err(ContractError::CampaignEnded {});
    }

    // If already joined, just submit (idempotent join)
    if PARTICIPANTS.has(deps.storage, (campaign_id, &info.sender)) {
        let mut p = PARTICIPANTS.load(deps.storage, (campaign_id, &info.sender))?;
        if p.content_hash.is_some() {
            return Err(ContractError::ContentAlreadySubmitted {});
        }
        p.content_hash = Some(content_hash.clone());
        p.post_url     = Some(post_url);
        PARTICIPANTS.save(deps.storage, (campaign_id, &info.sender), &p)?;
        return Ok(Response::new()
            .add_attribute("action", "join_and_submit")
            .add_attribute("campaign_id", campaign_id.to_string())
            .add_attribute("content_hash", content_hash));
    }

    // Not yet joined — check spot availability then join + submit atomically
    if campaign.participant_count >= campaign.max_participants {
        return Err(ContractError::CampaignFull {});
    }

    let participant = Participant {
        address:       info.sender.clone(),
        content_hash:  Some(content_hash.clone()),
        post_url:      Some(post_url),
        joined_at:     env.block.time.seconds(),
        reward_claimed: false,
        reward_amount:  Uint128::zero(),
    };

    PARTICIPANTS.save(deps.storage, (campaign_id, &info.sender), &participant)?;
    CAMPAIGN_PARTICIPANTS.save(
        deps.storage,
        (campaign_id, campaign.participant_count),
        &info.sender,
    )?;

    campaign.participant_count += 1;
    CAMPAIGNS.save(deps.storage, campaign_id, &campaign)?;

    let mut stats = STATS.load(deps.storage)?;
    stats.total_participants += 1;
    STATS.save(deps.storage, &stats)?;

    Ok(Response::new()
        .add_attribute("action", "join_and_submit")
        .add_attribute("campaign_id", campaign_id.to_string())
        .add_attribute("content_hash", content_hash))
}

fn distribute_rewards(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    campaign_id: u64,
) -> Result<Response, ContractError> {
    let mut campaign = CAMPAIGNS.load(deps.storage, campaign_id)
        .map_err(|_| ContractError::CampaignNotFound {})?;

    // Allow creator OR the registered operator to distribute
    let is_authorized = campaign.creator == info.sender
        || campaign.operator.as_ref().map_or(false, |op| op == &info.sender);
    if !is_authorized {
        return Err(ContractError::Unauthorized {});
    }
    if campaign.distributed {
        return Err(ContractError::AlreadyDistributed {});
    }
    // Allow distribution for active campaigns (early end) or expired ones,
    // but not for already-cancelled campaigns.
    if matches!(campaign.status, CampaignStatus::Cancelled) {
        return Err(ContractError::CampaignNotActive {});
    }

    let count = campaign.participant_count;
    let mut messages: Vec<BankMsg> = vec![];

    if count == 0 {
        // No participants — refund entire pool to creator
        if !campaign.reward_pool.is_zero() {
            messages.push(BankMsg::Send {
                to_address: campaign.creator.to_string(),
                amount: vec![Coin {
                    denom: INJ_DENOM.to_string(),
                    amount: campaign.reward_pool,
                }],
            });
        }
    } else {
        let reward_per  = campaign.reward_pool / Uint128::from(count);
        let total_paid  = reward_per * Uint128::from(count);
        let leftover    = campaign.reward_pool - total_paid;

        // Push reward to every participant and mark as claimed
        for i in 0..count {
            let addr = CAMPAIGN_PARTICIPANTS.load(deps.storage, (campaign_id, i))?;
            let mut p = PARTICIPANTS.load(deps.storage, (campaign_id, &addr))?;
            p.reward_amount   = reward_per;
            p.reward_claimed  = true;
            PARTICIPANTS.save(deps.storage, (campaign_id, &addr), &p)?;

            if !reward_per.is_zero() {
                messages.push(BankMsg::Send {
                    to_address: addr.to_string(),
                    amount: vec![Coin {
                        denom: INJ_DENOM.to_string(),
                        amount: reward_per,
                    }],
                });
            }
        }

        // Return integer-division remainder to creator
        if !leftover.is_zero() {
            messages.push(BankMsg::Send {
                to_address: campaign.creator.to_string(),
                amount: vec![Coin {
                    denom: INJ_DENOM.to_string(),
                    amount: leftover,
                }],
            });
        }

        let mut stats = STATS.load(deps.storage)?;
        stats.total_rewards_distributed += total_paid;
        STATS.save(deps.storage, &stats)?;
    }

    campaign.distributed = true;
    campaign.status = CampaignStatus::Distributed;
    CAMPAIGNS.save(deps.storage, campaign_id, &campaign)?;

    Ok(Response::new()
        .add_messages(messages)
        .add_attribute("action", "distribute_rewards")
        .add_attribute("campaign_id", campaign_id.to_string())
        .add_attribute("count", count.to_string()))
}

fn claim_reward(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    campaign_id: u64,
) -> Result<Response, ContractError> {
    let campaign = CAMPAIGNS.load(deps.storage, campaign_id)
        .map_err(|_| ContractError::CampaignNotFound {})?;

    if !campaign.distributed {
        return Err(ContractError::NotDistributed {});
    }

    let mut participant = PARTICIPANTS
        .load(deps.storage, (campaign_id, &info.sender))
        .map_err(|_| ContractError::NotParticipant {})?;

    if participant.reward_claimed {
        return Err(ContractError::AlreadyClaimed {});
    }
    if participant.reward_amount.is_zero() {
        return Err(ContractError::NoReward {});
    }

    let amount = participant.reward_amount;
    participant.reward_claimed = true;
    PARTICIPANTS.save(deps.storage, (campaign_id, &info.sender), &participant)?;

    let send_msg = BankMsg::Send {
        to_address: info.sender.to_string(),
        amount: vec![Coin { denom: INJ_DENOM.to_string(), amount }],
    };

    Ok(Response::new()
        .add_message(send_msg)
        .add_attribute("action", "claim_reward")
        .add_attribute("campaign_id", campaign_id.to_string())
        .add_attribute("recipient", info.sender)
        .add_attribute("amount", amount))
}

fn cancel_campaign(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    campaign_id: u64,
) -> Result<Response, ContractError> {
    let mut campaign = CAMPAIGNS.load(deps.storage, campaign_id)
        .map_err(|_| ContractError::CampaignNotFound {})?;

    if campaign.creator != info.sender {
        return Err(ContractError::Unauthorized {});
    }
    if campaign.distributed {
        return Err(ContractError::AlreadyDistributed {});
    }

    campaign.status = CampaignStatus::Cancelled;
    CAMPAIGNS.save(deps.storage, campaign_id, &campaign)?;

    // Refund creator
    let refund = BankMsg::Send {
        to_address: info.sender.to_string(),
        amount: vec![Coin {
            denom: INJ_DENOM.to_string(),
            amount: campaign.reward_pool,
        }],
    };

    Ok(Response::new()
        .add_message(refund)
        .add_attribute("action", "cancel_campaign")
        .add_attribute("campaign_id", campaign_id.to_string()))
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetCampaign { campaign_id } => to_json_binary(&query_campaign(deps, campaign_id)?),
        QueryMsg::ListCampaigns { start_after, limit } => {
            to_json_binary(&query_campaigns(deps, start_after, limit)?)
        }
        QueryMsg::GetParticipants { campaign_id } => {
            to_json_binary(&query_participants(deps, campaign_id)?)
        }
        QueryMsg::GetReward { campaign_id, participant } => {
            to_json_binary(&query_reward(deps, campaign_id, participant)?)
        }
        QueryMsg::GetStats {} => to_json_binary(&query_stats(deps)?),
    }
}

fn campaign_to_response(c: Campaign) -> CampaignResponse {
    CampaignResponse {
        id: c.id,
        creator: c.creator.to_string(),
        operator: c.operator.map(|a| a.to_string()),
        title: c.title,
        description: c.description,
        target_platform: c.target_platform,
        reward_pool: c.reward_pool,
        duration_days: c.duration_days,
        max_participants: c.max_participants,
        participant_count: c.participant_count,
        status: match c.status {
            CampaignStatus::Active => "active".to_string(),
            CampaignStatus::Ended => "ended".to_string(),
            CampaignStatus::Cancelled => "cancelled".to_string(),
            CampaignStatus::Distributed => "distributed".to_string(),
        },
        created_at: c.created_at,
        ends_at: c.ends_at,
        distributed: c.distributed,
    }
}

fn query_campaign(deps: Deps, campaign_id: u64) -> StdResult<CampaignResponse> {
    let campaign = CAMPAIGNS.load(deps.storage, campaign_id)?;
    Ok(campaign_to_response(campaign))
}

fn query_campaigns(
    deps: Deps,
    start_after: Option<u64>,
    limit: Option<u32>,
) -> StdResult<CampaignsResponse> {
    let limit = limit.unwrap_or(30) as usize;
    let start = start_after.unwrap_or(0) + 1;
    let total = CAMPAIGN_COUNT.load(deps.storage)?;

    let mut campaigns = vec![];
    for id in start..=total {
        if campaigns.len() >= limit {
            break;
        }
        if let Ok(c) = CAMPAIGNS.load(deps.storage, id) {
            campaigns.push(campaign_to_response(c));
        }
    }

    Ok(CampaignsResponse { campaigns })
}

fn query_participants(deps: Deps, campaign_id: u64) -> StdResult<ParticipantsResponse> {
    let campaign = CAMPAIGNS.load(deps.storage, campaign_id)?;
    let mut participants = vec![];

    for i in 0..campaign.participant_count {
        if let Ok(addr) = CAMPAIGN_PARTICIPANTS.load(deps.storage, (campaign_id, i)) {
            if let Ok(p) = PARTICIPANTS.load(deps.storage, (campaign_id, &addr)) {
                participants.push(ParticipantInfo {
                    address: p.address.to_string(),
                    content_hash: p.content_hash,
                    post_url: p.post_url,
                    joined_at: p.joined_at,
                    reward_claimed: p.reward_claimed,
                    reward_amount: p.reward_amount,
                });
            }
        }
    }

    Ok(ParticipantsResponse { participants })
}

fn query_reward(deps: Deps, campaign_id: u64, participant: String) -> StdResult<RewardResponse> {
    let addr = deps.api.addr_validate(&participant)?;
    let p = PARTICIPANTS.load(deps.storage, (campaign_id, &addr))?;
    Ok(RewardResponse {
        amount: p.reward_amount,
        claimed: p.reward_claimed,
    })
}

fn query_stats(deps: Deps) -> StdResult<StatsResponse> {
    let s = STATS.load(deps.storage)?;
    Ok(StatsResponse {
        total_campaigns: s.total_campaigns,
        total_participants: s.total_participants,
        total_rewards_distributed: s.total_rewards_distributed,
    })
}
